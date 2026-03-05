import { DateGranularity } from '@lightdash/common';

export const standardGranularityValues = new Set<string>(
    Object.values(DateGranularity),
);

/**
 * Returns a human-readable label for a granularity value.
 * Standard DateGranularity values are already title-cased (e.g. "Day", "Week").
 * Custom granularities use the label from the provided map if available,
 * otherwise fall back to title-casing the key.
 */
export const getGranularityLabel = (
    granularity: DateGranularity | string,
    customLabels?: Record<string, string>,
): string => {
    if (standardGranularityValues.has(granularity)) {
        return granularity;
    }
    if (customLabels && granularity in customLabels) {
        return customLabels[granularity];
    }
    return granularity
        .split('_')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
};
