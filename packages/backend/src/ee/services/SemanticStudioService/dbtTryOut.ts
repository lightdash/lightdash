import {
    getErrorMessage,
    NotFoundError,
    type Explore,
    type ExploreError,
    type SemanticStudioWorkspace,
} from '@lightdash/common';
import { createHash } from 'crypto';
import { text } from 'node:stream/consumers';
import { type FileStorageClient } from '../../../clients/FileStorage/FileStorageClient';
import Logger from '../../../logging/logger';
import { type SemanticStudioWorkspaceModel } from '../../models/SemanticStudioWorkspaceModel';
import { type DbtFileChange } from './dbtManifestPatch';

/** What is stored for a person's latest dbt change: the pull request it went to, and what it compiles to. */
export type DbtTryOut = {
    prUrl: string | null;
    explores: (Explore | ExploreError)[];
};

export type DbtTryOutStorage = Pick<
    FileStorageClient,
    'isEnabled' | 'uploadTxt' | 'getFileStream' | 'deleteFile'
>;

type TryOutOwner = { projectUuid: string; userUuid: string };

/** The workspace a try-out is read for: its conversation names the file, its pull request vouches for an older one. */
type TryOutWorkspace = Pick<
    SemanticStudioWorkspace,
    'threadUuid' | 'pullRequest'
>;

/** One try-out per conversation, so each workspace keeps its own; null is where one was kept before workspaces. */
const dbtTryOutFileId = (
    { projectUuid, userUuid }: TryOutOwner,
    threadUuid: string | null,
) =>
    `semantic-studio-dbt-try-out/${projectUuid}/${userUuid}${threadUuid ? `/${threadUuid}` : ''}`;

/** Identifies a change by the commit its manifest was compiled at and the content it leaves; equal fingerprints compile to the same explores. */
export const dbtChangeFingerprint = (
    compiledCommitSha: string,
    changes: DbtFileChange[],
    lightdashConfigYaml: string | null,
) =>
    createHash('sha256')
        .update(
            JSON.stringify([
                compiledCommitSha,
                lightdashConfigYaml,
                changes
                    .filter(({ base, next }) => base !== next)
                    .sort((a, b) => (a.path < b.path ? -1 : 1))
                    .map(({ path, next }) => [path, next]),
            ]),
        )
        .digest('hex');

/** What a checked change compiled to, kept so the compile after its merge can reuse it. */
const checkedExploresFileId = (projectUuid: string, fingerprint: string) =>
    `semantic-studio-checked-explores/${projectUuid}/${fingerprint}`;

/** Keeps what a code-mode change compiled to as the conversation's try-out, until the preview project is built. */
export const saveDbtTryOut = async (
    storage: DbtTryOutStorage,
    owner: TryOutOwner,
    threadUuid: string | null,
    tryOut: DbtTryOut,
): Promise<void> => {
    if (!storage.isEnabled()) return;
    await storage.uploadTxt(
        Buffer.from(JSON.stringify(tryOut)),
        dbtTryOutFileId(owner, threadUuid),
    );
};

const readDbtTryOutFile = async (
    storage: DbtTryOutStorage,
    fileId: string,
): Promise<DbtTryOut | null> => {
    try {
        const { stream } = await storage.getFileStream(`${fileId}.txt`);
        const tryOut: DbtTryOut = JSON.parse(await text(stream));
        return Array.isArray(tryOut.explores) ? tryOut : null;
    } catch (error) {
        if (error instanceof NotFoundError || error instanceof SyntaxError)
            return null;
        throw error;
    }
};

/** The try-out of the person's active workspace; without one, their latest change from before workspaces. */
const readDbtTryOut = async (
    storage: DbtTryOutStorage,
    owner: TryOutOwner,
    active: TryOutWorkspace | null,
): Promise<{ fileId: string; tryOut: DbtTryOut } | null> => {
    if (!storage.isEnabled()) return null;
    if (active?.threadUuid) {
        const fileId = dbtTryOutFileId(owner, active.threadUuid);
        const tryOut = await readDbtTryOutFile(storage, fileId);
        if (tryOut) return { fileId, tryOut };
    }
    const legacyId = dbtTryOutFileId(owner, null);
    const legacy = await readDbtTryOutFile(storage, legacyId);
    // An older try-out belongs to the active workspace only when it is for that workspace's pull request.
    if (!legacy || (active && legacy.prUrl !== active.pullRequest?.url)) {
        return null;
    }
    return { fileId: legacyId, tryOut: legacy };
};

/** Forgets this person's try-out once its pull request is merged or closed. */
export const retireDbtTryOut = async (
    storage: DbtTryOutStorage,
    owner: TryOutOwner,
    active: TryOutWorkspace | null,
    prUrl: string,
): Promise<void> => {
    const found = await readDbtTryOut(storage, owner, active);
    if (found?.tryOut.prUrl !== prUrl) return;
    await storage.deleteFile(`${found.fileId}.txt`);
};

/** The explores of the person's checked-out dbt change: its last branch compile, else its try-out. */
export const findDbtDraftExplores = async (
    {
        storage,
        workspaceModel,
    }: {
        storage: DbtTryOutStorage;
        workspaceModel: Pick<
            SemanticStudioWorkspaceModel,
            'findActive' | 'findBranchCompile'
        >;
    },
    owner: TryOutOwner,
): Promise<Map<string, Explore | ExploreError> | null> => {
    const active = await workspaceModel.findActive(owner);
    const compile = active
        ? await workspaceModel.findBranchCompile(active.workspaceUuid)
        : null;
    // Models the branch removes still show until it merges.
    if (compile?.explores) {
        return new Map(
            compile.explores.map((explore) => [explore.name, explore]),
        );
    }
    const found = await readDbtTryOut(storage, owner, active);
    // Models the change removes still show; the preview shows removals.
    return found
        ? new Map(
              found.tryOut.explores.map((explore) => [explore.name, explore]),
          )
        : null;
};

/** Keeps what a passed check compiled to, so the compile after the change merges can skip compiling it again. */
export const keepCheckedExplores = async (
    storage: DbtTryOutStorage,
    projectUuid: string,
    fingerprint: string,
    explores: (Explore | ExploreError)[],
): Promise<void> => {
    if (!storage.isEnabled()) return;
    // Checks whose change never merges leave their file behind; they are a few explores each.
    await storage
        .uploadTxt(
            Buffer.from(JSON.stringify(explores)),
            checkedExploresFileId(projectUuid, fingerprint),
        )
        .catch((error: unknown) => {
            Logger.warn(
                `SemanticStudio: failed to keep a checked change's explores: ${getErrorMessage(error)}`,
            );
        });
};

/** What a check compiled the same change to, removed once read; null when no check left it. */
export const takeCheckedExplores = async (
    storage: DbtTryOutStorage,
    projectUuid: string,
    fingerprint: string,
): Promise<(Explore | ExploreError)[] | null> => {
    if (!storage.isEnabled()) return null;
    const fileId = `${checkedExploresFileId(projectUuid, fingerprint)}.txt`;
    try {
        const { stream } = await storage.getFileStream(fileId);
        const explores: unknown = JSON.parse(await text(stream));
        await storage.deleteFile(fileId).catch((error: unknown) => {
            Logger.warn(
                `SemanticStudio: failed to remove a checked change's explores: ${getErrorMessage(error)}`,
            );
        });
        return Array.isArray(explores) ? explores : null;
    } catch (error) {
        if (!(error instanceof NotFoundError)) {
            Logger.warn(
                `SemanticStudio: failed to read a checked change's explores: ${getErrorMessage(error)}`,
            );
        }
        return null;
    }
};
