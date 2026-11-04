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

const ELIDED_MARKER = '\n...(truncated)...\n';

// Keeps the head and the tail, where a traceback names the failing line and
// the exception.
export const truncateMiddle = (value: string, maxChars: number): string => {
    if (value.length <= maxChars) return value;
    const kept = Math.max(maxChars - ELIDED_MARKER.length, 0);
    const head = Math.floor(kept / 4);
    return `${value.slice(0, head)}${ELIDED_MARKER}${value.slice(
        value.length - (kept - head),
    )}`;
};

// TODO: move this out...
export const DASHBOARD_CHARTS_PREVIEW_COUNT = 5;
