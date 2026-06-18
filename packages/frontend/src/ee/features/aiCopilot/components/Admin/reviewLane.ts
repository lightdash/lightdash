import {
    type AiAgentReviewItemStatus,
    type AiAgentReviewItemSummary,
    type AiAgentReviewRemediationStatus,
} from '@lightdash/common';
import { isTriageReviewItem } from './reviewItemDetails';

export type ReviewLane = 'needs_triage' | 'todo' | 'in_progress' | 'done';

// ts-unused-exports:disable-next-line
export const REVIEW_LANES: { id: ReviewLane; label: string; color: string }[] =
    [
        { id: 'needs_triage', label: 'Needs triage', color: 'gray' },
        { id: 'todo', label: 'To Do', color: 'indigo' },
        { id: 'in_progress', label: 'In Progress', color: 'yellow' },
        { id: 'done', label: 'Done', color: 'green' },
    ];

// ts-unused-exports:disable-next-line
export const BOARD_STATUSES: AiAgentReviewItemStatus[] = [
    'open',
    'in_progress',
    'resolved',
    'dismissed',
    'duplicate',
];

const ACTIVE_REMEDIATION_STATUSES: AiAgentReviewRemediationStatus[] = [
    'queued',
    'running',
    'pr_open',
    'preview_ready',
];

const isWritebackInFlight = (item: AiAgentReviewItemSummary): boolean =>
    item.prWritebackStatus === 'queued' ||
    item.prWritebackStatus === 'running' ||
    (item.remediation !== null &&
        ACTIVE_REMEDIATION_STATUSES.includes(item.remediation.status));

export const getReviewLane = (item: AiAgentReviewItemSummary): ReviewLane => {
    if (
        item.status === 'resolved' ||
        item.status === 'dismissed' ||
        item.status === 'duplicate'
    ) {
        return 'done';
    }
    if (item.status === 'in_progress') {
        return 'in_progress';
    }
    return isTriageReviewItem(item) ? 'needs_triage' : 'todo';
};

// ts-unused-exports:disable-next-line
export const LANE_TARGET_STATUS: Record<
    ReviewLane,
    AiAgentReviewItemStatus | null
> = {
    needs_triage: null,
    todo: 'open',
    in_progress: 'in_progress',
    done: 'resolved',
};

// ts-unused-exports:disable-next-line
export const getStartWritebackKind = (
    item: AiAgentReviewItemSummary,
): 'modal' | 'mutate' | null => {
    if (
        !item.writebackEligibility.eligible ||
        item.linkedPrUrl ||
        item.prWritebackStatus === 'queued' ||
        item.prWritebackStatus === 'running'
    ) {
        return null;
    }
    if (item.primaryRootCause === 'project_context') {
        return 'modal';
    }
    if (item.primaryRootCause === 'semantic_layer') {
        return 'mutate';
    }
    return null;
};

export const parsePrNumber = (url: string | null): number | null => {
    if (!url) return null;
    const match = url.match(/\/pull\/(\d+)/);
    return match ? Number(match[1]) : null;
};

export const partitionInProgress = (
    items: AiAgentReviewItemSummary[],
): { active: AiAgentReviewItemSummary[]; rest: AiAgentReviewItemSummary[] } => {
    const active: AiAgentReviewItemSummary[] = [];
    const rest: AiAgentReviewItemSummary[] = [];
    items.forEach((item) => {
        (isWritebackInFlight(item) ? active : rest).push(item);
    });
    return { active, rest };
};
