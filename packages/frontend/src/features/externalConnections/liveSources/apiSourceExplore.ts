import {
    ExploreType,
    getItemLabelWithoutTableName,
    getItemMap,
    type ApiSourceExplore,
    type Explore,
} from '@lightdash/common';
import { useExplore } from '../../../hooks/useExplore';

/** Tooltip for features a live data source can't run yet. */
export const NOT_ON_LIVE_SOURCES = 'Not available on live data sources yet';

/**
 * The integration rules of a live data source explore; null for any other
 * explore. Reads the explore the page already loaded and never fetches, so
 * merge and SQL runner names don't request an explore that doesn't exist.
 */
export const useApiSourceExplore = (
    exploreName: string | undefined,
): ApiSourceExplore | null => {
    const { data: explore } = useExplore(exploreName, { enabled: false });
    return explore?.type === ExploreType.API_SOURCE
        ? (explore.apiSource ?? null)
        : null;
};

/** The date range a query reads when it doesn't filter on the explore's date. */
export const getDefaultDateRangeNote = (explore: Explore): string | null => {
    const dateRange = explore.apiSource?.dateRange;
    if (!dateRange) {
        return null;
    }
    const dateField = getItemMap(explore)[dateRange.fieldId];
    const dateLabel = dateField
        ? getItemLabelWithoutTableName(dateField)
        : 'date';
    return `Without a filter on ${dateLabel}, queries read the last ${dateRange.defaultDays} days.`;
};
