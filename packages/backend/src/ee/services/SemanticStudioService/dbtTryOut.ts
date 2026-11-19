import { type Explore, type ExploreError } from '@lightdash/common';

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
