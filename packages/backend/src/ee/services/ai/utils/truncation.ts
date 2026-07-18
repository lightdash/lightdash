const TRUNCATED_SUFFIX = '...(truncated)';

// Truncates CSV at a row boundary so the result never ends in a partial row,
// which the model would read as corrupted data.
export const truncateCsvAtRowBoundary = (
    csv: string,
    maxChars: number,
): string => {
    const slice = csv.slice(0, Math.max(maxChars, 0));
    const lastNewline = slice.lastIndexOf('\n');
    return lastNewline > 0 ? slice.slice(0, lastNewline) : slice;
};

export const truncate = (value: string, max: number) => {
    if (max === Infinity) return value;
    if (!Number.isFinite(max) || max <= 0) return '';

    const maxChars = Math.floor(max);
    const valueChars = Array.from(value);
    if (valueChars.length <= maxChars) return value;

    return `${valueChars.slice(0, maxChars).join('')}${TRUNCATED_SUFFIX}`;
};

const DEFAULT_WORD_BOUNDARY_ELLIPSIS = '...';

export const truncateAtWordBoundary = (
    value: string,
    maxLength: number,
    ellipsis = DEFAULT_WORD_BOUNDARY_ELLIPSIS,
): string => {
    const trimmed = value.trim();
    const chars = Array.from(trimmed);
    if (chars.length <= maxLength) return trimmed;

    const ellipsisChars = Array.from(ellipsis);
    const maxContentLength = maxLength - ellipsisChars.length;
    if (maxContentLength <= 0) {
        return ellipsisChars.slice(0, maxLength).join('');
    }

    const content = chars.slice(0, maxContentLength).join('');
    const lastSpace = content.lastIndexOf(' ');
    const truncatedContent =
        lastSpace > 0 ? content.slice(0, lastSpace) : content;

    return `${truncatedContent.trimEnd()}${ellipsis}`;
};

// TODO: move this out...
export const DASHBOARD_CHARTS_PREVIEW_COUNT = 5;
