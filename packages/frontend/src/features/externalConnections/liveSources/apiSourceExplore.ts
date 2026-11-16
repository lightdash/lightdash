import {
    ExploreType,
    getApiSourceCapabilities,
    getApiSourceFilterOperators,
    getItemId,
    getItemLabelWithoutTableName,
    getItemMap,
    isApiSourcePushdownSupported,
    isMetric,
    isTableCalculation,
    type ApiConnectorType,
    type ApiSourceCapabilities,
    type ApiSourceExplore,
    type Explore,
    type FilterableField,
    type FilterOperator,
} from '@lightdash/common';
import useEmbed from '../../../ee/providers/Embed/useEmbed';
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
 * Whether the explore is a live data source that can't run `feature`, read
 * from its connector's capabilities; false for any other explore.
 */
export const useIsRefusedOnLiveSource = (
    exploreName: string | undefined,
    feature: keyof ApiSourceCapabilities['pushdown'],
): boolean => {
    const apiSource = useApiSourceExplore(exploreName);
    return (
        apiSource !== null &&
        !isApiSourcePushdownSupported(
            getApiSourceCapabilities(apiSource).pushdown[feature],
        )
    );
};

/**
 * The operators a live data source runs on `field`, or null when any
 * operator goes: no live data source, no field yet, or a table calculation,
 * which the table calculation pushdown rules cover instead.
 */
const getLiveSourceOperators = (
    apiSource: ApiSourceExplore | null | undefined,
    field: FilterableField | undefined,
): FilterOperator[] | null =>
    apiSource && field && !isTableCalculation(field)
        ? getApiSourceFilterOperators(
              apiSource,
              getItemId(field),
              isMetric(field),
          )
        : null;

/** The operator options a live data source runs on `field`; all of them elsewhere. */
export const getLiveSourceOperatorOptions = <
    T extends { value: FilterOperator },
>(
    options: T[],
    apiSource: ApiSourceExplore | null | undefined,
    field: FilterableField | undefined,
): T[] => {
    const operators = getLiveSourceOperators(apiSource, field);
    return operators
        ? options.filter(({ value }) => operators.includes(value))
        : options;
};

/** The operators a live data source runs on `field`; undefined when any goes. */
export const getLiveSourceSupportedOperators = (
    apiSource: ApiSourceExplore | null | undefined,
    field: FilterableField,
): FilterOperator[] | undefined =>
    getLiveSourceOperators(apiSource, field) ?? undefined;

/** Whether a live data source can filter on `field` at all; true elsewhere. */
export const isFilterableOnLiveSource = (
    apiSource: ApiSourceExplore | null | undefined,
    field: FilterableField,
): boolean => (getLiveSourceOperators(apiSource, field) ?? [null]).length > 0;

/** Which filter group shapes a live data source runs; every shape elsewhere. */
export const getLiveSourceFilterGroups = (
    apiSource: ApiSourceExplore | null | undefined,
): { or: boolean; nestedGroups: boolean } => {
    if (!apiSource) {
        return { or: true, nestedGroups: true };
    }
    const { filters } = getApiSourceCapabilities(apiSource);
    return { or: filters.or, nestedGroups: filters.nestedGroups };
};

export type LiveSourceExploreSummary = {
    connectionUuid: string;
    connector: ApiConnectorType;
    /** The explore's label, e.g. "Events". */
    label: string;
};

/**
 * The live data source an explore reads and the explore's label, or null for
 * any other explore. Fetches the explore only when the explore list says it
 * is a live one.
 */
const useLiveSourceExploreData = (
    exploreName: string | null,
    enabled = true,
) => {
    const projectUuid = useProjectUuid();
    const { data: explores } = useExplores(projectUuid, true, false, {
        enabled: enabled && exploreName !== null && projectUuid !== undefined,
        onError: () => undefined,
    });
    const summary =
        exploreName === null
            ? undefined
            : (explores ?? []).find(
                  ({ name, type }) =>
                      name === exploreName && type === ExploreType.API_SOURCE,
              );
    const { data: explore } = useExplore(summary?.name, {
        onError: () => undefined,
    });
    return { summary, explore };
};

/**
 * The integration rules of the live data source behind a table, e.g. a
 * dashboard filter's field; null for any other table. A live data source
 * explore has one table, named like the explore. Embedded dashboards skip
 * it: their token can't list explores, and the backend still refuses.
 */
export const useLiveSourceApiSource = (
    tableName: string | null | undefined,
): ApiSourceExplore | null => {
    const { embedToken } = useEmbed();
    return (
        useLiveSourceExploreData(tableName ?? null, !embedToken).explore
            ?.apiSource ?? null
    );
};

export const useLiveSourceExplore = (
    exploreName: string | null,
): LiveSourceExploreSummary | null => {
    const { summary, explore } = useLiveSourceExploreData(exploreName);
    if (!summary || !explore?.apiSource) {
        return null;
    }
    return {
        connectionUuid: explore.apiSource.connectionUuid,
        connector: explore.apiSource.integration,
        label: summary.label,
    };
};

/** The live data source an explore reads, or null for any other explore. */
export const useApiSourceExploreConnectionUuid = (
    exploreName: string | null,
): string | null => useLiveSourceExplore(exploreName)?.connectionUuid ?? null;

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
