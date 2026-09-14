import {
    isStandardDateGranularity,
    type DateGranularity,
    type UiStringResolver,
} from '@lightdash/common';

/**
 * Returns a human-readable label for a granularity value.
 * Standard DateGranularity values are already title-cased (e.g. "Day", "Week").
 * Custom granularities use the label from the provided map if available,
 * otherwise fall back to title-casing the key.
 */
export const getGranularityLabel = (
    granularity: DateGranularity | string,
    customLabels?: Record<string, string>,
    getUiString?: UiStringResolver,
): string => {
    if (customLabels && granularity in customLabels) {
        return customLabels[granularity];
    }
    if (isStandardDateGranularity(granularity)) {
        return getUiString
            ? getUiString(`dateZoom.granularities.${granularity}`)
            : granularity;
    }
    return granularity
        .split('_')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
};

/**
 * Label for the collapsed filter-bar summary: translated standard granularity,
 * raw custom granularity, or the "Default" label when no zoom is active.
 */
export const getDateZoomSummaryLabel = (
    granularity: DateGranularity | string | undefined,
    getUiString: UiStringResolver,
): string => {
    if (!granularity) return getUiString('filters.summary.default');
    return isStandardDateGranularity(granularity)
        ? getUiString(`dateZoom.granularities.${granularity}`)
        : granularity;
};
