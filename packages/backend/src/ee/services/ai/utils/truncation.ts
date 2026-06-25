const TRUNCATED_SUFFIX = '...(truncated)';

export const truncate = (value: string, max: number) => {
    if (max === Infinity) return value;
    if (!Number.isFinite(max) || max <= 0) return '';

    const maxChars = Math.floor(max);
    const valueChars = Array.from(value);
    if (valueChars.length <= maxChars) return value;

    return `${valueChars.slice(0, maxChars).join('')}${TRUNCATED_SUFFIX}`;
};

// TODO: move this out...
export const DASHBOARD_CHARTS_PREVIEW_COUNT = 5;
