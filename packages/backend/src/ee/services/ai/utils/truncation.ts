/**
 * Caps on content previews to keep AI agent context windows under control.
 * Semantic-layer descriptions are intentionally not truncated in discovery tools.
 */
export const CONTENT_DESCRIPTION_MAX_CHARS = 600;

export const DASHBOARD_CHARTS_PREVIEW_COUNT = 5;

export const truncate = (value: string, max: number) =>
    value.length > max ? `${value.slice(0, max)}…` : value;
