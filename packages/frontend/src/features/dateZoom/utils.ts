import { DateGranularity } from '@lightdash/common';

export const standardGranularityValues = new Set<string>(
    Object.values(DateGranularity),
);

/**
 * Returns a human-readable label for a granularity value.
 * Standard DateGranularity values are already title-cased (e.g. "Day", "Week").
 * Custom granularity keys (e.g. "slt_week") are converted to title case
 * with underscores replaced by spaces (e.g. "Slt Week").
 */
export const getGranularityLabel = (
    granularity: DateGranularity | string,
): string => {
    if (standardGranularityValues.has(granularity)) {
        return granularity;
    }
    return granularity
        .split('_')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
};
