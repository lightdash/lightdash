import { type AiPromptContextItem } from '@lightdash/common';

export type ReviewEntityItem = Extract<
    AiPromptContextItem,
    {
        type:
            | 'pull_request'
            | 'proposed_change'
            | 'review_finding'
            | 'preview_environment';
    }
>;

const REVIEW_ENTITY_TYPES = new Set<AiPromptContextItem['type']>([
    'pull_request',
    'proposed_change',
    'review_finding',
    'preview_environment',
]);

export const isReviewEntityItem = (
    item: AiPromptContextItem,
): item is ReviewEntityItem => REVIEW_ENTITY_TYPES.has(item.type);
