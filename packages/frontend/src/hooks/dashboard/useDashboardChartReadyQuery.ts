import {
    EMPTY_DATE_ZOOM_CONFIG,
    FeatureFlags,
    getAvailableParametersFromTables,
    getChartZoomableFields,
    getDateZoomCapabilities,
    getDateZoomXAxisFieldId,
    hasReservedParameterReference,
    QueryExecutionContext,
    resolveTileDateZoom,
    type ApiError,
    type ApiExecuteAsyncDashboardChartQueryResults,
    type ApiExploreResults,
    type DateZoom,
    type ExecuteAsyncDashboardChartRequestParams,
    type SavedChart,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { lightdashApi } from '../../api';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import useDashboardTileStatusContext from '../../providers/Dashboard/useDashboardTileStatusContext';
import { convertDateDashboardFilters } from '../../utils/dateFilter';
import { useExplore } from '../useExplore';
import { useQueryRetryConfig } from '../useQueryRetry';
import { useSavedQuery } from '../useSavedQuery';
import useSearchParams from '../useSearchParams';
import { useServerFeatureFlag } from '../useServerOrClientFeatureFlag';
import { useSessionTimezone } from '../useSessionTimezone';
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
        timezone?: string;
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
    // The resolved date zoom for this tile (control grain + field, or the
    // Default). Downstream consumers reuse it so visualization, downloads, and
    // underlying data agree with the query that was executed.
    dateZoom: DateZoom | undefined;
};

export const useDashboardChartReadyQuery = (
    tileUuid: string,
    chartUuid: string | null,
    contextOverride?: QueryExecutionContext,
) => {
    const retryConfig = useQueryRetryConfig();
    const dashboardUuid = useDashboardContext((c) => c.dashboard?.uuid);
    const invalidateCache = useDashboardTileStatusContext(
        (c) => c.invalidateCache,
    );
    const dashboardFilters = useDashboardFiltersForTile(tileUuid);
    const chartSort = useDashboardContext((c) => c.chartSort);
    const parameterValues = useDashboardContext((c) => c.parameterValues);
    const addParameterReferences = useDashboardContext(
        (c) => c.addParameterReferences,
    );
    const markTileLoaded = useDashboardTileStatusContext(
        (c) => c.markTileLoaded,
    );
    const tileParameterReferences = useDashboardContext(
        (c) => c.tileParameterReferences,
    );
    const dashboardSorts = useMemo(
        () => chartSort[tileUuid] || [],
        [chartSort, tileUuid],
    );
    const granularity = useDashboardContext((c) => c.dateZoomGranularity);
    const autoRefresh = useDashboardTileStatusContext((c) => c.isAutoRefresh);
    const context =
        useSearchParams<QueryExecutionContext>('context') || undefined;
    const setTilesWithDateZoomApplied = useDashboardContext(
        (c) => c.setTilesWithDateZoomApplied,
    );

    // Date zoom controls (gated): when the flag is off, resolve against the
    // empty config so every tile takes the Default branch and any saved controls
    // are inert, keeping flag-off byte-for-byte identical to today.
    const { data: dateZoomConfigFlag } = useServerFeatureFlag(
        FeatureFlags.DateZoomConfiguration,
    );
    const isDateZoomConfigEnabled =
        dateZoomConfigFlag?.enabled ?? import.meta.env.DEV;
    const savedDateZoomConfig = useDashboardContext((c) => c.dateZoomConfig);
    const dateZoomConfig = isDateZoomConfigEnabled
        ? savedDateZoomConfig
        : EMPTY_DATE_ZOOM_CONFIG;
    const controlGranularities = useDashboardContext(
        (c) => c.controlGranularities,
    );
    const addParameterDefinitions = useDashboardContext(
        (c) => c.addParameterDefinitions,
    );
    const setChartZoomableFields = useDashboardContext(
        (c) => c.setChartZoomableFields,
    );

    const sortKey =
        dashboardSorts
            ?.map((ds) => `${ds.fieldId}.${ds.descending}`)
            ?.join(',') || '';

    const projectUuid = useDashboardContext((c) => c.projectUuid);
    const sessionTimezone = useSessionTimezone();
    const chartQuery = useSavedQuery({
        uuidOrSlug: chartUuid ?? undefined,
        projectUuid,
    });

    const { data: explore, error: exploreError } = useExplore(
        chartQuery.data?.metricQuery?.exploreName,
    );

    const addAvailableCustomGranularities = useDashboardTileStatusContext(
        (c) => c.addAvailableCustomGranularities,
    );

    useEffect(() => {
        if (explore) {
            addParameterDefinitions(
                getAvailableParametersFromTables(Object.values(explore.tables)),
            );
        }
    }, [explore, addParameterDefinitions]);

    const dateZoomCapabilities = useMemo(() => {
        if (!chartQuery.data || !explore) return undefined;
        return getDateZoomCapabilities(explore, chartQuery.data.metricQuery);
    }, [chartQuery.data, explore]);

    // Report this tile's zoomable date fields up so the date-zoom control modal
    // can offer exactly the fields the chart plots, not every explore dimension.
    const chartZoomableFields = useMemo(() => {
        if (!chartQuery.data || !explore) return undefined;
        return getChartZoomableFields(explore, chartQuery.data.metricQuery);
    }, [chartQuery.data, explore]);

    useEffect(() => {
        if (chartZoomableFields) {
            setChartZoomableFields(tileUuid, chartZoomableFields);
        }
    }, [chartZoomableFields, setChartZoomableFields, tileUuid]);

    // Target the chart's own x-axis date field so the backend re-grains the
    // field the chart actually plots, rather than auto-picking the first date
    // dimension in the query (which can differ when there are several).
    const dateZoomXAxisFieldId = useMemo(
        () =>
            chartQuery.data
                ? getDateZoomXAxisFieldId(chartQuery.data.chartConfig, explore)
                : undefined,
        [chartQuery.data, explore],
    );

    // Single source of truth for this tile's wire date zoom. Attached tiles zoom
    // their control's grain on the target field; unassigned tiles fall through to
    // the Default (the existing global picker + x-axis baseline).
    const tileDateZoom = useMemo(
        () =>
            resolveTileDateZoom({
                config: dateZoomConfig,
                tileUuid,
                runtimeGranularities: controlGranularities,
                globalGranularity: granularity,
                defaultXAxisFieldId: dateZoomXAxisFieldId,
            }),
        [
            dateZoomConfig,
            tileUuid,
            controlGranularities,
            granularity,
            dateZoomXAxisFieldId,
        ],
    );

    useEffect(() => {
        if (!dateZoomCapabilities) return;

        if (
            Object.keys(dateZoomCapabilities.availableCustomGranularities)
                .length > 0
        ) {
            addAvailableCustomGranularities(
                dateZoomCapabilities.availableCustomGranularities,
            );
        }
    }, [dateZoomCapabilities, addAvailableCustomGranularities]);

    const timezoneFixFilters =
        dashboardFilters && convertDateDashboardFilters(dashboardFilters);

    const hasADateDimension = dateZoomCapabilities
        ? dateZoomCapabilities.hasDateDimension ||
          dateZoomCapabilities.hasTimestampDimension
        : false;

    // A chart is also affected by date zoom when its custom SQL references a reserved
    // date-zoom parameter, even with no date dimension on the axis.
    const referencesDateZoomReservedParam = useMemo(
        () =>
            hasReservedParameterReference(
                tileParameterReferences?.[tileUuid] ?? [],
            ),
        [tileParameterReferences, tileUuid],
    );

    const isAffectedByDateZoom =
        hasADateDimension || referencesDateZoomReservedParam;

    const chartParameterValues = useMemo(() => {
        if (!tileParameterReferences || !tileParameterReferences[tileUuid])
            return {};
        return Object.fromEntries(
            Object.entries(parameterValues).filter(([key]) =>
                tileParameterReferences[tileUuid].includes(key),
            ),
        );
    }, [parameterValues, tileParameterReferences, tileUuid]);

    // dateZoomApplied comes from the query response — the backend is the
    // single source of truth for whether zoom was actually applied.
    // We still need a pre-query estimate for the query key so we avoid
    // unnecessary refetches when zoom won't have an effect.
    const isZoomLikelyApplied =
        isAffectedByDateZoom && tileDateZoom !== undefined;

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
            isZoomLikelyApplied ? (tileDateZoom?.granularity ?? null) : null,
            isZoomLikelyApplied ? (tileDateZoom?.xAxisFieldId ?? null) : null,
            invalidateCache,
            chartParameterValues,
            sessionTimezone,
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
            isZoomLikelyApplied,
            tileDateZoom,
            invalidateCache,
            chartParameterValues,
            sessionTimezone,
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

            const dateZoom = tileDateZoom;

            const executeQueryResponse = isEmbedContext
                ? await postEmbedDashboardTileQuery(
                      chartQuery.data.projectUuid,
                      {
                          tileUuid,
                          dashboardFilters: timezoneFixFilters,
                          dashboardSorts,
                          dateZoom,
                          invalidateCache,
                          parameters: parameterValues,
                          pivotResults: true,
                          timezone: sessionTimezone ?? undefined,
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
                          dateZoom,
                          invalidateCache,
                          parameters: parameterValues,
                          pivotResults: true,
                      },
                  );

            return {
                chart: chartQuery.data,
                explore,
                executeQueryResponse,
                dateZoom: tileDateZoom,
            };
        },
        enabled: Boolean(
            chartUuid && dashboardUuid && chartQuery.data && explore,
        ),
        ...retryConfig,
        refetchOnMount: false,
    });

    // Backend reports it for overridden date dimensions; charts that only
    // reference the reserved date-zoom param are in effect whenever the resolved
    // tile grain is set (the same value substituted into their SQL on the wire).
    const dateZoomApplied =
        (queryResult.data?.executeQueryResponse?.dateZoomApplied ?? false) ||
        (referencesDateZoomReservedParam && !!tileDateZoom?.granularity);

    useEffect(() => {
        if (!isAffectedByDateZoom) return;

        // Keyed by tileUuid: a duplicated saved chart shares its chartUuid across
        // tiles, but each tile needs its own applied state.
        setTilesWithDateZoomApplied((prev) => {
            const nextSet = new Set(prev ?? []);
            if (dateZoomApplied) {
                nextSet.add(tileUuid);
            } else {
                nextSet.delete(tileUuid);
            }
            return nextSet;
        });
    }, [
        dateZoomApplied,
        isAffectedByDateZoom,
        tileUuid,
        setTilesWithDateZoomApplied,
    ]);

    useEffect(() => {
        if (queryResult.data?.executeQueryResponse?.parameterReferences) {
            addParameterReferences(
                tileUuid,
                queryResult.data.executeQueryResponse.parameterReferences,
            );
            markTileLoaded(tileUuid);
        } else if (queryResult.error) {
            // On error, there are no references, but we count the tile as loaded
            addParameterReferences(tileUuid, []);
            markTileLoaded(tileUuid);
        }
    }, [
        queryResult.data?.executeQueryResponse?.parameterReferences,
        addParameterReferences,
        markTileLoaded,
        tileUuid,
        queryResult.error,
    ]);

    return {
        ...queryResult,
        chartQuery,
        error: chartQuery.error || exploreError || queryResult.error,
    };
};
