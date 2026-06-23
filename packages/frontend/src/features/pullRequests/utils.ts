import {
    assertUnreachable,
    PullRequestProvider,
    PullRequestSource,
    PullRequestState,
} from '@lightdash/common';
import { type PullRequestRow } from './types';

export const DEFAULT_PULL_REQUESTS_PAGE_SIZE = 25;
export type PullRequestThreadPreviewTarget = {
    projectUuid: string;
    agentUuid: string;
    threadUuid: string;
    reviewItemUuid?: string;
};

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
 * In-app AI agent thread path for a PR. Review remediation PRs link back to
 * the source review thread; other AI PRs fall back to the writeback thread.
 */
export const getThreadPath = (row: PullRequestRow): string | null => {
    const target = getThreadPreviewTarget(row);
    if (!target) return null;

    const query = target.reviewItemUuid
        ? `?reviewItem=${encodeURIComponent(target.reviewItemUuid)}`
        : '';
    return `/projects/${target.projectUuid}/ai-agents/${target.agentUuid}/threads/${target.threadUuid}${query}`;
};

export const getThreadPreviewTarget = (
    row: PullRequestRow,
): PullRequestThreadPreviewTarget | null => {
    if (row.reviewContext?.sourceThreadUuid) {
        return {
            projectUuid: row.reviewContext.sourceProjectUuid,
            agentUuid: row.reviewContext.sourceAgentUuid,
            threadUuid: row.reviewContext.sourceThreadUuid,
            reviewItemUuid: row.reviewContext.reviewItemUuid,
        };
    }

    if (!row.aiThreadUuid || !row.aiAgentUuid) {
        return null;
    }

    return {
        projectUuid: row.projectUuid,
        agentUuid: row.aiAgentUuid,
        threadUuid: row.aiThreadUuid,
    };
};

export const getReviewPath = (row: PullRequestRow): string | null => {
    if (!row.reviewContext) {
        return null;
    }

    const params = new URLSearchParams();
    params.set('reviewProjectUuid', row.reviewContext.sourceProjectUuid);
    params.set('reviewAgentUuid', row.reviewContext.sourceAgentUuid);
    if (row.reviewContext.sourceThreadUuid) {
        params.set('reviewThreadUuid', row.reviewContext.sourceThreadUuid);
    }
    params.set('reviewItemUuid', row.reviewContext.reviewItemUuid);

    return `/generalSettings/ai/issues?${params.toString()}`;
};
