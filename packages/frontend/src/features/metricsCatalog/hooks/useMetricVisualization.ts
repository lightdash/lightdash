import {
    buildPopAdditionalMetric,
    CartesianSeriesType,
    ChartType,
    FilterOperator,
    getDefaultDateRangeFromInterval,
    getFieldIdForDateDimension,
    getItemId,
    getPopPeriodLabel,
    isCompleteLayout,
    MetricExplorerComparison,
    METRICS_EXPLORER_DATE_FORMAT,
    QueryExecutionContext,
    TimeFrames,
    type ApiError,
    type ChartConfig,
    type CreateSavedChartVersion,
    type FilterRule,
    type Filters,
    type MetricExplorerDateRange,
    type MetricQuery,
    type MetricWithAssociatedTimeDimension,
    type Series,
    type TimeDimensionConfig,
} from '@lightdash/common';
import dayjs from 'dayjs';
import { useMemo, useRef } from 'react';
import { type VisualizationProviderProps } from '../../../components/LightdashVisualization/VisualizationProvider';
import { type MetricQueryDataContext } from '../../../components/MetricQueryData/context';
import {
    getExpectedSeriesMap,
    mergeExistingAndExpectedSeries,
} from '../../../hooks/cartesianChartConfig/utils';
import { useExplore } from '../../../hooks/useExplore';
import { type QueryResultsProps } from '../../../hooks/useQueryResults';
import { useQueryExecutor } from '../../../providers/Explorer/useQueryExecutor';
import { useMetric } from './useMetricsCatalog';

const METRICS_EXPLORER_PREVIOUS_PERIOD_OFFSET_DEFAULT = 1;
const METRICS_EXPLORER_PREVIOUS_PERIOD_GRANULARITY_DEFAULT = TimeFrames.YEAR;

const buildMetricQueryFromField = (
    field: MetricWithAssociatedTimeDimension,
    timeDimensionOverride?: TimeDimensionConfig,
    segmentDimensionId?: string | null,
    filterRule?: FilterRule,
    dateRange?: MetricExplorerDateRange,
    ids?: {
        dateFilterId: string;
        dimensionsFilterGroupId: string;
    },
    comparison?: MetricExplorerComparison,
    compareMetric?: { table: string; name: string } | null,
): MetricQuery => {
    const timeDimensionConfig = timeDimensionOverride ?? field.timeDimension;
    const timeDimensionName =
        timeDimensionConfig?.field && timeDimensionConfig.interval
            ? getFieldIdForDateDimension(
                  timeDimensionConfig.field,
                  timeDimensionConfig.interval,
              )
            : undefined;
    const timeDimensionFieldId =
        timeDimensionConfig && timeDimensionName
            ? getItemId({
                  name: timeDimensionName,
                  table: timeDimensionConfig.table,
              })
            : undefined;

    const shouldCompareToPreviousYear =
        comparison === MetricExplorerComparison.PREVIOUS_PERIOD &&
        timeDimensionConfig &&
        timeDimensionName;

    const dimensions = [timeDimensionFieldId, segmentDimensionId].filter(
        (d): d is string => Boolean(d),
    );

    const dateFilterRule: FilterRule | undefined =
        timeDimensionFieldId && dateRange
            ? {
                  id: ids?.dateFilterId ?? 'metrics-explore-date-filter',
                  target: { fieldId: timeDimensionFieldId },
                  operator: FilterOperator.IN_BETWEEN,
                  values: [
                      dayjs(dateRange[0]).format(METRICS_EXPLORER_DATE_FORMAT),
                      dayjs(dateRange[1]).format(METRICS_EXPLORER_DATE_FORMAT),
                  ],
              }
            : undefined;

    const dimensionRules = [filterRule, dateFilterRule].filter(
        (r): r is FilterRule => Boolean(r),
    );

    const filters: Filters =
        dimensionRules.length > 0
            ? {
                  dimensions: {
                      id:
                          ids?.dimensionsFilterGroupId ??
                          'metrics-explore-dimensions-filters',
                      and: dimensionRules,
                  },
              }
            : {};

    const baseMetricId = getItemId(field);
    const compareMetricId =
        comparison === MetricExplorerComparison.DIFFERENT_METRIC &&
        compareMetric?.table &&
        compareMetric?.name
            ? getItemId({
                  table: compareMetric.table,
                  name: compareMetric.name,
              })
            : undefined;
    const popResult =
        shouldCompareToPreviousYear && timeDimensionFieldId
            ? buildPopAdditionalMetric({
                  metric: field,
                  timeDimensionId: timeDimensionFieldId,
                  granularity:
                      METRICS_EXPLORER_PREVIOUS_PERIOD_GRANULARITY_DEFAULT,
                  periodOffset: METRICS_EXPLORER_PREVIOUS_PERIOD_OFFSET_DEFAULT,
              })
            : null;

    const popMetricId = popResult?.metricId;

    return {
        exploreName: field.table,
        dimensions,
        metrics:
            popMetricId !== undefined
                ? [baseMetricId, popMetricId]
                : compareMetricId !== undefined
                  ? [baseMetricId, compareMetricId]
                  : [baseMetricId],
        filters,
        sorts: [],
        limit: 5000,
        tableCalculations: [],
        ...(popResult !== null
            ? { additionalMetrics: [popResult.additionalMetric] }
            : {}),
    };
};

/**
 * Builds a line chart configuration for a single metric over time
 */
const buildLineChartConfig = (
    metricQuery: MetricQuery,
    metricLabel: string,
    comparison: MetricExplorerComparison | undefined,
    compareMetricLabel: string | undefined,
): ChartConfig => {
    const timeDimensionFieldId = metricQuery.dimensions[0];
    const metricFieldId = metricQuery.metrics[0];
    const secondMetricFieldId = metricQuery.metrics[1];

    const secondSeriesName =
        comparison === MetricExplorerComparison.PREVIOUS_PERIOD
            ? `${metricLabel} (${getPopPeriodLabel(
                  METRICS_EXPLORER_PREVIOUS_PERIOD_GRANULARITY_DEFAULT,
                  METRICS_EXPLORER_PREVIOUS_PERIOD_OFFSET_DEFAULT,
              )})`
            : comparison === MetricExplorerComparison.DIFFERENT_METRIC
              ? (compareMetricLabel ?? 'Comparison')
              : undefined;

    return {
        type: ChartType.CARTESIAN,
        config: {
            layout: {
                xField: timeDimensionFieldId,
                yField: secondMetricFieldId
                    ? [metricFieldId, secondMetricFieldId]
                    : [metricFieldId],
            },
            eChartsConfig: {
                series: [
                    {
                        encode: {
                            xRef: { field: timeDimensionFieldId },
                            yRef: { field: metricFieldId },
                        },
                        type: CartesianSeriesType.LINE,
                        name: metricLabel,
                    },
                    ...(secondMetricFieldId && secondSeriesName
                        ? [
                              {
                                  encode: {
                                      xRef: { field: timeDimensionFieldId },
                                      yRef: { field: secondMetricFieldId },
                                  },
                                  type: CartesianSeriesType.LINE,
                                  name: secondSeriesName,
                              },
                          ]
                        : []),
                ],
            },
        },
    };
};

export type MetricVisualizationResult = {
    metricField: MetricWithAssociatedTimeDimension | undefined;
    explore: MetricQueryDataContext['explore'];

    metricQuery: MetricQueryDataContext['metricQuery'];

    // Time dimension config (for granularity picker)
    timeDimensionConfig: TimeDimensionConfig | undefined;
    effectiveDateRange: MetricExplorerDateRange | undefined;

    chartConfig: VisualizationProviderProps['chartConfig'];
    resultsData: VisualizationProviderProps['resultsData'];
    columnOrder: VisualizationProviderProps['columnOrder'];
    /**
     * Pre-computed series for VisualizationProvider.
     * This ensures proper color assignment for pivoted series without needing onChartConfigChange.
     * @see DashboardChartTile for the same pattern
     */
    computedSeries: Series[];

    /**
     * The unsaved chart version ready for saving or "Explore from here".
     * Undefined when required data (metricQuery, chartConfig, tableName) is not available.
     */
    unsavedChartVersion: CreateSavedChartVersion | undefined;

    hasData: boolean;
    isLoading: VisualizationProviderProps['isLoading'];
    error: ApiError | null;
};

type UseMetricVisualizationProps = {
    projectUuid: string | undefined;
    tableName: string | undefined;
    metricName: string | undefined;
    timeDimensionOverride?: TimeDimensionConfig;
    segmentDimensionId?: string | null;
    filterRule?: FilterRule;
    dateRange?: MetricExplorerDateRange;
    comparison?: MetricExplorerComparison;
    compareMetric?: {
        table: string;
        name: string;
        label: string;
    } | null;
};

/**
 * Hook that fetches metric data, executes the query, and builds visualization config
 *
 * 1. Fetches metric field metadata
 * 2. Fetches explore schema (for ItemsMap)
 * 3. Builds and executes MetricQuery
 * 4. Returns everything VisualizationProvider needs
 */
export function useMetricVisualization({
    projectUuid,
    tableName,
    metricName,
    timeDimensionOverride,
    segmentDimensionId,
    filterRule,
    dateRange,
    comparison,
    compareMetric,
}: UseMetricVisualizationProps): MetricVisualizationResult {
    /**
     * Keep filter IDs stable to avoid unnecessary query churn.
     */
    const dateFilterIdRef = useRef<string>('metrics-explore-date-filter');
    const dimensionsFilterGroupIdRef = useRef<string>(
        'metrics-explore-dimensions-filters',
    );

    // 1. Fetch metric field metadata
    const metricFieldQuery = useMetric({
        projectUuid,
        tableName,
        metricName,
    });

    // 2. Fetch explore schema (needed for ItemsMap with proper field types)
    const exploreQuery = useExplore(tableName);

    // 3. Compute current time dimension config (override or default)
    const timeDimensionConfig = useMemo(() => {
        return timeDimensionOverride ?? metricFieldQuery.data?.timeDimension;
    }, [timeDimensionOverride, metricFieldQuery.data?.timeDimension]);

    const defaultDateRange = useMemo(() => {
        if (!timeDimensionConfig) return undefined;
        return getDefaultDateRangeFromInterval(timeDimensionConfig.interval);
    }, [timeDimensionConfig]);

    const effectiveDateRange = useMemo(() => {
        return dateRange ?? defaultDateRange;
    }, [dateRange, defaultDateRange]);

    // 4. Build MetricQuery & Start executing
    const metricQuery = useMemo(() => {
        if (!metricFieldQuery.data) return undefined;

        const effectiveComparison =
            comparison === MetricExplorerComparison.DIFFERENT_METRIC &&
            (!compareMetric?.table || !compareMetric?.name)
                ? MetricExplorerComparison.NONE
                : comparison;

        const built = buildMetricQueryFromField(
            metricFieldQuery.data,
            timeDimensionConfig,
            segmentDimensionId,
            filterRule,
            effectiveDateRange,
            {
                dateFilterId: dateFilterIdRef.current,
                dimensionsFilterGroupId: dimensionsFilterGroupIdRef.current,
            },
            effectiveComparison,
            effectiveComparison === MetricExplorerComparison.DIFFERENT_METRIC
                ? compareMetric
                : null,
        );
        return built;
    }, [
        metricFieldQuery.data,
        timeDimensionConfig,
        segmentDimensionId,
        filterRule,
        effectiveDateRange,
        comparison,
        compareMetric,
    ]);

    const queryArgs = useMemo<QueryResultsProps | null>(() => {
        if (!projectUuid || !tableName || !metricQuery) return null;
        return {
            projectUuid,
            tableId: tableName,
            query: metricQuery,
            context: QueryExecutionContext.METRICS_EXPLORER,
        };
    }, [projectUuid, tableName, metricQuery]);

    const [{ query: createQuery, queryResults }] = useQueryExecutor(
        queryArgs,
        [], // no missing parameters
        !!queryArgs,
    );

    /**
     * Use the metricQuery from createQuery when available, falling back to our computed metricQuery.
     * With computedSeries handling series generation from actual row data, we no longer need
     * the queryUuid synchronization - series are computed based on what's actually in queryResults.
     */
    const executedMetricQuery = createQuery.data?.metricQuery ?? metricQuery;

    // 4. Build properties for VisualizationProvider
    const chartConfig = useMemo<ChartConfig>(() => {
        if (!executedMetricQuery || !metricFieldQuery.data) {
            return { type: ChartType.CARTESIAN, config: undefined };
        }
        const cfg = buildLineChartConfig(
            executedMetricQuery,
            metricFieldQuery.data.label,
            comparison,
            compareMetric?.label ?? undefined,
        );
        return cfg;
    }, [executedMetricQuery, metricFieldQuery.data, comparison, compareMetric]);

    const resultsData = useMemo(() => {
        const fields = createQuery.data?.fields ?? {};
        return {
            ...queryResults,
            metricQuery: executedMetricQuery,
            fields,
        };
    }, [queryResults, executedMetricQuery, createQuery.data?.fields]);

    const columnOrder = useMemo(() => {
        if (!executedMetricQuery) return [];
        return [
            ...executedMetricQuery.dimensions,
            ...executedMetricQuery.metrics,
        ];
    }, [executedMetricQuery]);

    /**
     * Pre-compute series for VisualizationProvider to ensure proper color assignment.
     * Without this, pivoted series may appear transparent because the provider's
     * fallbackColors are computed before series expansion happens.
     *
     * This follows the same pattern as DashboardChartTile.
     */
    const computedSeries = useMemo<Series[]>(() => {
        if (
            chartConfig.type !== ChartType.CARTESIAN ||
            !chartConfig.config ||
            !isCompleteLayout(chartConfig.config.layout) ||
            !queryResults.hasFetchedAllRows ||
            queryResults.rows.length === 0
        ) {
            return [];
        }

        const firstSerie = chartConfig.config.eChartsConfig.series?.[0];
        const expectedSeriesMap = getExpectedSeriesMap({
            defaultSmooth: firstSerie?.smooth,
            defaultShowSymbol: firstSerie?.showSymbol,
            defaultAreaStyle: firstSerie?.areaStyle,
            defaultCartesianType: CartesianSeriesType.LINE,
            availableDimensions: executedMetricQuery?.dimensions ?? [],
            isStacked: false,
            pivotKeys: segmentDimensionId ? [segmentDimensionId] : undefined,
            resultsData: queryResults,
            xField: chartConfig.config.layout.xField,
            yFields: chartConfig.config.layout.yField,
            defaultLabel: firstSerie?.label,
            itemsMap: createQuery.data?.fields ?? {},
        });

        const pivotKeys = segmentDimensionId ? [segmentDimensionId] : undefined;
        const sortedByPivot =
            !!pivotKeys?.length &&
            !!executedMetricQuery?.sorts?.some((sort) =>
                pivotKeys.includes(sort.fieldId),
            );

        return mergeExistingAndExpectedSeries({
            expectedSeriesMap,
            existingSeries: chartConfig.config.eChartsConfig.series ?? [],
            sortedByPivot,
        });
    }, [
        chartConfig,
        queryResults,
        executedMetricQuery?.dimensions,
        executedMetricQuery?.sorts,
        segmentDimensionId,
        createQuery.data?.fields,
    ]);

    const unsavedChartVersion = useMemo<
        CreateSavedChartVersion | undefined
    >(() => {
        if (!metricQuery || !chartConfig || !tableName) return undefined;

        return {
            tableName,
            metricQuery,
            chartConfig,
            tableConfig: {
                columnOrder,
            },
            pivotConfig: segmentDimensionId
                ? { columns: [segmentDimensionId] }
                : undefined,
        };
    }, [metricQuery, chartConfig, tableName, columnOrder, segmentDimensionId]);

    const isLoading =
        metricFieldQuery.isLoading ||
        exploreQuery.isLoading ||
        createQuery.isFetching ||
        queryResults.isFetchingFirstPage;

    const hasData = Boolean(
        tableName &&
        exploreQuery.data &&
        metricQuery &&
        createQuery.data?.fields &&
        queryResults.rows.length > 0,
    );

    const error =
        metricFieldQuery.error ||
        exploreQuery.error ||
        createQuery.error ||
        queryResults.error ||
        null;

    const result = useMemo(() => {
        return {
            metricField: metricFieldQuery.data,
            explore: exploreQuery.data,
            metricQuery,
            timeDimensionConfig,
            effectiveDateRange,
            chartConfig,
            resultsData,
            columnOrder,
            computedSeries,
            unsavedChartVersion,
            isLoading,
            hasData,
            error,
        };
    }, [
        metricFieldQuery.data,
        exploreQuery.data,
        metricQuery,
        timeDimensionConfig,
        effectiveDateRange,
        chartConfig,
        resultsData,
        columnOrder,
        computedSeries,
        unsavedChartVersion,
        isLoading,
        hasData,
        error,
    ]);

    return result;
}
