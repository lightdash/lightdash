import {
    ExploreType,
    getItemLabelWithoutTableName,
    getItemMap,
    type ApiSourceExplore,
    type Explore,
} from '@lightdash/common';
import { useExplore } from '../../../hooks/useExplore';
import { useExplores } from '../../../hooks/useExplores';
import { useProjectUuid } from '../../../hooks/useProjectUuid';

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

/**
 * The live data source an explore reads, or null for any other explore.
 * Fetches the explore only when the explore list says it is a live one.
 */
export const useApiSourceExploreConnectionUuid = (
    exploreName: string | null,
): string | null => {
    const projectUuid = useProjectUuid();
    const { data: explores } = useExplores(projectUuid, true, false, {
        enabled: exploreName !== null && projectUuid !== undefined,
        onError: () => undefined,
    });
    const isLive =
        exploreName !== null &&
        (explores ?? []).some(
            ({ name, type }) =>
                name === exploreName && type === ExploreType.API_SOURCE,
        );
    const { data: explore } = useExplore(isLive ? exploreName : undefined, {
        onError: () => undefined,
    });
    return explore?.apiSource?.connectionUuid ?? null;
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
