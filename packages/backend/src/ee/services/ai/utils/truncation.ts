/**
 * Caps on tool-result previews to keep AI agent context windows under control.
 * Exact semantic-layer field lookup returns full descriptions.
 */
export const CONTENT_DESCRIPTION_MAX_CHARS = 600;
export const FIELD_DESCRIPTION_PREVIEW_CHARS = 100;
export const SEARCH_RESULT_PREVIEW_MIN_RANK = 0.25;
export const TRUNCATED_PREVIEW_SUFFIX = ' ... (truncated)';

export const DASHBOARD_CHARTS_PREVIEW_COUNT = 5;

export const truncate = (value: string, max: number) =>
    value.length > max ? `${value.slice(0, max)}…` : value;

export const truncatePreview = (value: string, max: number) =>
    value.length > max
        ? `${value.slice(0, max)}${TRUNCATED_PREVIEW_SUFFIX}`
        : value;

export const hasMinimumPreviewRank = (item: { searchRank?: number }) =>
    item.searchRank === undefined ||
    item.searchRank >= SEARCH_RESULT_PREVIEW_MIN_RANK;
