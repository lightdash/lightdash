import {
    assertUnreachable,
    PullRequestProvider,
    PullRequestSource,
    PullRequestState,
} from '@lightdash/common';
import { type PullRequestRow } from './types';

export const DEFAULT_PULL_REQUESTS_PAGE_SIZE = 25;

export const getSourceLabel = (source: PullRequestSource): string => {
    switch (source) {
        case PullRequestSource.CUSTOM_METRIC:
            return 'Custom metric';
        case PullRequestSource.CUSTOM_DIMENSION:
            return 'Custom dimension';
        case PullRequestSource.SQL_RUNNER:
            return 'SQL runner';
        case PullRequestSource.SOURCE_EDITOR:
            return 'Source editor';
        case PullRequestSource.AI_AGENT:
            return 'AI agent';
        default:
            return assertUnreachable(source, `Unknown source ${source}`);
    }
};

/** Mantine color for a PR state badge. */
export const getStateColor = (state: PullRequestState | null): string => {
    if (state === null) return 'gray';
    switch (state) {
        case PullRequestState.OPEN:
            return 'green';
        case PullRequestState.CLOSED:
            return 'red';
        case PullRequestState.MERGED:
            return 'violet';
        default:
            return assertUnreachable(state, `Unknown state ${state}`);
    }
};

export const getProviderLabel = (provider: PullRequestProvider): string =>
    provider === PullRequestProvider.GITHUB ? 'GitHub' : 'GitLab';

/** A distinct Mantine color per source, so each source tag reads differently. */
export const getSourceColor = (source: PullRequestSource): string => {
    switch (source) {
        case PullRequestSource.CUSTOM_METRIC:
            return 'blue';
        case PullRequestSource.CUSTOM_DIMENSION:
            return 'cyan';
        case PullRequestSource.SQL_RUNNER:
            return 'grape';
        case PullRequestSource.SOURCE_EDITOR:
            return 'orange';
        case PullRequestSource.AI_AGENT:
            return 'indigo';
        default:
            return assertUnreachable(source, `Unknown source ${source}`);
    }
};

/**
 * In-app AI agent thread path for a PR, or null when the PR didn't originate
 * from an AI thread (no agent/thread to link to).
 */
export const getThreadPath = (row: PullRequestRow): string | null => {
    if (!row.aiThreadUuid || !row.aiAgentUuid) return null;
    return `/projects/${row.projectUuid}/ai-agents/${row.aiAgentUuid}/threads/${row.aiThreadUuid}`;
};
