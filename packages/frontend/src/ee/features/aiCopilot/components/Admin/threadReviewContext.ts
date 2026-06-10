import {
    type AiAgentReviewItemStatus,
    type AiAgentReviewItemSummary,
    type AiAgentRootCause,
} from '@lightdash/common';

export const THREAD_REVIEW_ITEM_STATUSES: AiAgentReviewItemStatus[] = [
    'open',
    'in_progress',
    'resolved',
    'dismissed',
    'duplicate',
];

export const threadReviewRootCauseLabels: Record<AiAgentRootCause, string> = {
    semantic_layer: 'Semantic layer',
    project_context: 'Project context',
    agent_configuration: 'Agent config',
    data_gap: 'Data gap',
    product_capability: 'Product',
    runtime_reliability: 'Runtime',
    feedback_quality: 'Feedback',
    not_a_failure: 'Not failure',
    ambiguous: 'Ambiguous',
};

export const threadReviewRootCauseColors: Record<AiAgentRootCause, string> = {
    semantic_layer: 'indigo',
    project_context: 'violet',
    agent_configuration: 'cyan',
    data_gap: 'orange',
    product_capability: 'grape',
    runtime_reliability: 'red',
    feedback_quality: 'teal',
    not_a_failure: 'gray',
    ambiguous: 'gray',
};

export const threadReviewStatusColors: Record<AiAgentReviewItemStatus, string> =
    {
        open: 'red',
        in_progress: 'yellow',
        resolved: 'green',
        dismissed: 'gray',
        duplicate: 'gray',
    };

export type ThreadReviewSummary = {
    items: AiAgentReviewItemSummary[];
    latestReviewItem: AiAgentReviewItemSummary | null;
    findingCount: number;
    openFindingCount: number;
    inProgressFindingCount: number;
    resolvedFindingCount: number;
    dismissedFindingCount: number;
    duplicateFindingCount: number;
};

const reviewStatusPriority: Record<AiAgentReviewItemStatus, number> = {
    open: 0,
    in_progress: 1,
    resolved: 2,
    dismissed: 3,
    duplicate: 4,
};

const getReviewItemTimestamp = (reviewItem: AiAgentReviewItemSummary) =>
    new Date(reviewItem.updatedAt ?? reviewItem.lastSeenAt ?? 0).getTime();

export const getThreadReviewItems = (
    reviewItems: AiAgentReviewItemSummary[],
    threadUuid: string,
): AiAgentReviewItemSummary[] =>
    reviewItems
        .filter(
            (reviewItem) => reviewItem.latestFinding?.threadUuid === threadUuid,
        )
        .sort((a, b) => {
            const statusDelta =
                reviewStatusPriority[a.status] - reviewStatusPriority[b.status];
            if (statusDelta !== 0) {
                return statusDelta;
            }
            return getReviewItemTimestamp(b) - getReviewItemTimestamp(a);
        });

export const summarizeThreadReviewItems = (
    reviewItems: AiAgentReviewItemSummary[],
    threadUuid: string,
): ThreadReviewSummary => {
    const items = getThreadReviewItems(reviewItems, threadUuid);

    return {
        items,
        latestReviewItem: items[0] ?? null,
        findingCount: items.length,
        openFindingCount: items.filter((item) => item.status === 'open').length,
        inProgressFindingCount: items.filter(
            (item) => item.status === 'in_progress',
        ).length,
        resolvedFindingCount: items.filter((item) => item.status === 'resolved')
            .length,
        dismissedFindingCount: items.filter(
            (item) => item.status === 'dismissed',
        ).length,
        duplicateFindingCount: items.filter(
            (item) => item.status === 'duplicate',
        ).length,
    };
};

export const getThreadReviewHeadline = (
    reviewItem: AiAgentReviewItemSummary | null,
): string | null =>
    reviewItem?.latestFinding?.recommendation?.title ??
    reviewItem?.title ??
    null;
