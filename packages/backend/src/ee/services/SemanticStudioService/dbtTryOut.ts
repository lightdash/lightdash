import { type Explore, type ExploreError } from '@lightdash/common';
import { createHash } from 'crypto';
import { type DbtFileChange } from './codeMode/dbtManifestPatch';

/** What is stored for a person's latest dbt change: the pull request it went to, and what it compiles to. */
export type DbtTryOut = {
    prUrl: string | null;
    explores: (Explore | ExploreError)[];
};

/** One try-out per conversation, so each workspace keeps its own; null is where one was kept before workspaces. */
export const dbtTryOutFileId = (
    projectUuid: string,
    userUuid: string,
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
export const checkedExploresFileId = (
    projectUuid: string,
    fingerprint: string,
) => `semantic-studio-checked-explores/${projectUuid}/${fingerprint}`;
