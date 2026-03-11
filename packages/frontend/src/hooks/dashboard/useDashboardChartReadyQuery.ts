import {
    DimensionType,
    FeatureFlags,
    getAvailableParametersFromTables,
    getDimensions,
    getItemId,
    isDateItem,
    isStandardDateGranularity,
    isSubDayGranularity,
    QueryExecutionContext,
    type ApiError,
    type ApiExecuteAsyncDashboardChartQueryResults,
    type ApiExploreResults,
    type ExecuteAsyncDashboardChartRequestParams,
    type SavedChart,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { lightdashApi } from '../../api';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import { convertDateDashboardFilters } from '../../utils/dateFilter';
import { useExplore } from '../useExplore';
import { useQueryRetryConfig } from '../useQueryRetry';
import { useSavedQuery } from '../useSavedQuery';
import useSearchParams from '../useSearchParams';
import { useServerFeatureFlag } from '../useServerOrClientFeatureFlag';
import useDashboardFiltersForTile from './useDashboardFiltersForTile';

const executeAsyncDashboardChartQuery = async (
    projectUuid: string,
    data: ExecuteAsyncDashboardChartRequestParams,
): Promise<ApiExecuteAsyncDashboardChartQueryResults> =>
    lightdashApi<ApiExecuteAsyncDashboardChartQueryResults>({
        url: `/projects/${projectUuid}/query/dashboard-chart`,
        version: 'v2',
        method: 'POST',
        body: JSON.stringify(data),
    });

// Embed-only endpoint for executing a dashboard tile query
const postEmbedDashboardTileQuery = async (
    projectUuid: string,
    data: {
        tileUuid: string;
    } & Pick<
        ExecuteAsyncDashboardChartRequestParams,
        | 'dashboardFilters'
        | 'dashboardSorts'
        | 'pivotResults'
        | 'invalidateCache'
        | 'dateZoom'
        | 'parameters'
    >,
): Promise<ApiExecuteAsyncDashboardChartQueryResults> =>
    lightdashApi<ApiExecuteAsyncDashboardChartQueryResults>({
        url: `/embed/${projectUuid}/query/dashboard-tile`,
        method: 'POST',
        body: JSON.stringify(data),
    });

export type DashboardChartReadyQuery = {
    executeQueryResponse: ApiExecuteAsyncDashboardChartQueryResults;
    chart: SavedChart;
    explore: ApiExploreResults;
};

export const useDashboardChartReadyQuery = (
    tileUuid: string,
    chartUuid: string | null,
    contextOverride?: QueryExecutionContext,
) => {
    const retryConfig = useQueryRetryConfig();
    const dashboardUuid = useDashboardContext((c) => c.dashboard?.uuid);
    const invalidateCache = useDashboardContext((c) => c.invalidateCache);
    const dashboardFilters = useDashboardFiltersForTile(tileUuid);
    const chartSort = useDashboardContext((c) => c.chartSort);
    const parameterValues = useDashboardContext((c) => c.parameterValues);
    const addParameterReferences = useDashboardContext(
        (c) => c.addParameterReferences,
    );
    const tileParameterReferences = useDashboardContext(
        (c) => c.tileParameterReferences,
    );
    const dashboardSorts = useMemo(
        () => chartSort[tileUuid] || [],
        [chartSort, tileUuid],
    );
    const granularity = useDashboardContext((c) => c.dateZoomGranularity);
    const autoRefresh = useDashboardContext((c) => c.isAutoRefresh);
    const context =
        useSearchParams<QueryExecutionContext>('context') || undefined;
    const setChartsWithDateZoomApplied = useDashboardContext(
        (c) => c.setChartsWithDateZoomApplied,
    );
    const addParameterDefinitions = useDashboardContext(
        (c) => c.addParameterDefinitions,
    );

    const sortKey =
        dashboardSorts
            ?.map((ds) => `${ds.fieldId}.${ds.descending}`)
            ?.join(',') || '';

    const chartQuery = useSavedQuery({
        id: chartUuid ?? undefined,
    });

    const { data: explore, error: exploreError } = useExplore(
        chartQuery.data?.metricQuery?.exploreName,
    );

    const addAvailableCustomGranularities = useDashboardContext(
        (c) => c.addAvailableCustomGranularities,
    );
    const setTileHasTimestampDimension = useDashboardContext(
        (c) => c.setTileHasTimestampDimension,
    );

    useEffect(() => {
        if (explore) {
            addParameterDefinitions(
                getAvailableParametersFromTables(Object.values(explore.tables)),
            );
        }
    }, [explore, addParameterDefinitions]);

    // Discover custom granularity key → label pairs from explore dimensions
    useEffect(() => {
        if (!explore) return;

        const customGranularities: Record<string, string> = {};
        for (const dim of getDimensions(explore)) {
            if (dim.customTimeInterval) {
                customGranularities[dim.customTimeInterval] = dim.label;
            }
        }

        if (Object.keys(customGranularities).length > 0) {
            addAvailableCustomGranularities(customGranularities);
        }
    }, [explore, addAvailableCustomGranularities]);

    const timezoneFixFilters =
        dashboardFilters && convertDateDashboardFilters(dashboardFilters);

    const { hasADateDimension, hasTimestampDimension, hasCustomGranularity } =
        useMemo(() => {
            const metricQueryDimensions = [
                ...(chartQuery.data?.metricQuery?.dimensions ?? []),
                ...(chartQuery.data?.metricQuery?.customDimensions ?? []),
            ];

            if (!explore)
                return {
                    hasADateDimension: false,
                    hasTimestampDimension: false,
                    hasCustomGranularity: false,
                };

            const allDims = getDimensions(explore);
            const dateDims = allDims.filter(
                (c) =>
                    metricQueryDimensions.includes(getItemId(c)) &&
                    isDateItem(c),
            );

            // Check if the chart's date dimensions have a sibling with the
            // active custom granularity. This mirrors the backend check in
            // updateExploreWithDateZoom which looks for
            // `${baseDimName}_${granularity}` in the explore.
            const customGranularityExists =
                granularity && !isStandardDateGranularity(granularity)
                    ? dateDims.some((dim) => {
                          const baseName =
                              dim.timeIntervalBaseDimensionName ?? dim.name;
                          return allDims.some(
                              (d) =>
                                  d.customTimeInterval === granularity &&
                                  (d.timeIntervalBaseDimensionName ??
                                      d.name) === baseName,
                          );
                      })
                    : false;

            return {
                hasADateDimension: dateDims.length > 0,
                hasTimestampDimension: dateDims.some(
                    (d) => d.type === DimensionType.TIMESTAMP,
                ),
                hasCustomGranularity: customGranularityExists,
            };
        }, [
            chartQuery.data?.metricQuery?.customDimensions,
            chartQuery.data?.metricQuery?.dimensions,
            explore,
            granularity,
        ]);

    // Report TIMESTAMP dimension presence to dashboard context per tile
    useEffect(() => {
        setTileHasTimestampDimension(tileUuid, hasTimestampDimension);
        return () => setTileHasTimestampDimension(tileUuid, false);
    }, [tileUuid, hasTimestampDimension, setTileHasTimestampDimension]);

    const chartParameterValues = useMemo(() => {
        if (!tileParameterReferences || !tileParameterReferences[tileUuid])
            return {};
        return Object.fromEntries(
            Object.entries(parameterValues).filter(([key]) =>
                tileParameterReferences[tileUuid].includes(key),
            ),
        );
    }, [parameterValues, tileParameterReferences, tileUuid]);

    // Determine if the zoom is effectively applied to this chart.
    // The backend skips zoom when:
    // 1. Sub-day zoom on DATE-only charts (no time component)
    // 2. Custom granularity that doesn't exist on the chart's date dimensions
    const isZoomEffectivelyApplied = useMemo(() => {
        if (!hasADateDimension || !granularity) return false;
        if (!isStandardDateGranularity(granularity)) {
            return hasCustomGranularity;
        }
        if (!hasTimestampDimension && isSubDayGranularity(granularity)) {
            return false;
        }
        return true;
    }, [
        hasADateDimension,
        hasTimestampDimension,
        hasCustomGranularity,
        granularity,
    ]);

    useEffect(() => {
        if (!chartUuid) return;

        setChartsWithDateZoomApplied((prev) => {
            if (hasADateDimension) {
                const nextSet = new Set(prev ?? []);
                if (isZoomEffectivelyApplied) {
                    nextSet.add(chartUuid);
                } else {
                    nextSet.delete(chartUuid);
                }
                return nextSet;
            }
            return prev;
        });
    }, [
        hasADateDimension,
        isZoomEffectivelyApplied,
        chartUuid,
        setChartsWithDateZoomApplied,
    ]);

    const { data: useSqlPivotResults } = useServerFeatureFlag(
        FeatureFlags.UseSqlPivotResults,
    );

    const queryKey = useMemo(
        () => [
            'dashboard_chart_ready_query',
            chartQuery.data?.projectUuid,
            chartUuid,
            dashboardUuid,
            timezoneFixFilters,
            dashboardSorts,
            sortKey,
            contextOverride || context,
            autoRefresh,
            isZoomEffectivelyApplied ? granularity : null,
            invalidateCache,
            chartParameterValues,
            useSqlPivotResults,
        ],
        [
            chartQuery.data?.projectUuid,
            chartUuid,
            dashboardUuid,
            timezoneFixFilters,
            dashboardSorts,
            sortKey,
            contextOverride,
            context,
            autoRefresh,
            isZoomEffectivelyApplied,
            granularity,
            invalidateCache,
            chartParameterValues,
            useSqlPivotResults,
        ],
    );

    const queryResult = useQuery<DashboardChartReadyQuery, ApiError>({
        queryKey,
        queryFn: async () => {
            if (!chartQuery.data || !explore) {
                throw new Error('Chart or explore is undefined');
            }

            const requestedContext =
                contextOverride || context || QueryExecutionContext.DASHBOARD;
            const effectiveContext = autoRefresh
                ? QueryExecutionContext.AUTOREFRESHED_DASHBOARD
                : requestedContext;

            const isEmbedContext =
                requestedContext === QueryExecutionContext.EMBED;

            const executeQueryResponse = isEmbedContext
                ? await postEmbedDashboardTileQuery(
                      chartQuery.data.projectUuid,
                      {
                          tileUuid,
                          dashboardFilters: timezoneFixFilters,
                          dashboardSorts,
                          dateZoom: {
                              granularity,
                          },
                          invalidateCache,
                          parameters: parameterValues,
                          pivotResults: useSqlPivotResults?.enabled,
                      },
                  )
                : await executeAsyncDashboardChartQuery(
                      chartQuery.data.projectUuid,
                      {
                          context: effectiveContext,
                          tileUuid,
                          chartUuid: chartUuid!,
                          dashboardUuid: dashboardUuid!,
                          dashboardFilters: timezoneFixFilters,
                          dashboardSorts,
                          dateZoom: {
                              granularity,
                          },
                          invalidateCache,
                          parameters: parameterValues,
                          pivotResults: useSqlPivotResults?.enabled,
                      },
                  );

            return {
                chart: chartQuery.data,
                explore,
                executeQueryResponse,
            };
        },
        enabled: Boolean(
            chartUuid && dashboardUuid && chartQuery.data && explore,
        ),
        ...retryConfig,
        refetchOnMount: false,
    });

    useEffect(() => {
        if (queryResult.data?.executeQueryResponse?.parameterReferences) {
            addParameterReferences(
                tileUuid,
                queryResult.data.executeQueryResponse.parameterReferences,
            );
        } else if (queryResult.error) {
            // On error, there are no references, but we count the tile as loaded
            addParameterReferences(tileUuid, []);
        }
    }, [
        queryResult.data?.executeQueryResponse?.parameterReferences,
        addParameterReferences,
        tileUuid,
        queryResult.error,
    ]);

    return {
        ...queryResult,
        error: chartQuery.error || exploreError || queryResult.error,
    };
};
