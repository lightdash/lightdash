/**
 * Caps on tool-result fields to keep AI agent context windows under control.
 * Oversized tool outputs (descriptions, hints, etc.) accumulate across the
 * agent loop and can exceed the model's context limit — see PROD-6017.
 */
export const EXPLORE_DESCRIPTION_MAX_CHARS = 600;
export const FIELD_DESCRIPTION_MAX_CHARS = 600;
export const CONTENT_DESCRIPTION_MAX_CHARS = 600;
export const AI_HINT_MAX_CHARS = 300;

export const DASHBOARD_CHARTS_PREVIEW_COUNT = 3;

export const truncate = (value: string, max: number) =>
    value.length > max ? `${value.slice(0, max)}…` : value;
