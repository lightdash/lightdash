import {
    getErrorMessage,
    NotFoundError,
    type Explore,
    type ExploreError,
} from '@lightdash/common';
import { createHash } from 'crypto';
import { text } from 'node:stream/consumers';
import { type FileStorageClient } from '../../../clients/FileStorage/FileStorageClient';
import Logger from '../../../logging/logger';
import { type DbtFileChange } from './dbtManifestPatch';

export type StudioFileStorage = Pick<
    FileStorageClient,
    'isEnabled' | 'uploadTxt' | 'getFileStream' | 'deleteFile'
>;

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

/** Keeps what a passed check compiled to, so the compile after the change merges can skip compiling it again. */
export const keepCheckedExplores = async (
    storage: StudioFileStorage,
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
    storage: StudioFileStorage,
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
