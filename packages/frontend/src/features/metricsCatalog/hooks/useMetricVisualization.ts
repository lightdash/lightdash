import {
    CartesianSeriesType,
    ChartType,
    FilterOperator,
    getDefaultDateRangeFromInterval,
    getFieldIdForDateDimension,
    getItemId,
    MetricExplorerComparison,
    METRICS_EXPLORER_DATE_FORMAT,
    QueryExecutionContext,
    TimeFrames,
    type ApiError,
    type ChartConfig,
    type FilterRule,
    type Filters,
    type MetricExplorerDateRange,
    type MetricQuery,
    type MetricWithAssociatedTimeDimension,
    type TimeDimensionConfig,
} from '@lightdash/common';
import dayjs from 'dayjs';
import { useMemo, useRef } from 'react';
import { type VisualizationProviderProps } from '../../../components/LightdashVisualization/VisualizationProvider';
import { type MetricQueryDataContext } from '../../../components/MetricQueryData/context';
import { useExplore } from '../../../hooks/useExplore';
import { type QueryResultsProps } from '../../../hooks/useQueryResults';
import { useQueryExecutor } from '../../../providers/Explorer/useQueryExecutor';
import { useMetric } from './useMetricsCatalog';

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

    return {
        exploreName: field.table,
        dimensions,
        metrics: [getItemId(field)],
        filters,
        sorts: [],
        limit: 5000,
        tableCalculations: [],
        ...(shouldCompareToPreviousYear
            ? {
                  periodOverPeriod: {
                      type: 'previousPeriod' as const,
                      // Compare each point to the same period last year
                      granularity: TimeFrames.YEAR,
                      periodOffset: 1,
                      field: {
                          name: timeDimensionName,
                          table: timeDimensionConfig.table,
                      },
                  },
              }
            : {}),
    };
};

/**
 * Builds a line chart configuration for a single metric over time
 */
const buildLineChartConfig = (
    metricQuery: MetricQuery,
    metricLabel: string,
): ChartConfig => {
    const timeDimensionFieldId = metricQuery.dimensions[0];
    const metricFieldId = metricQuery.metrics[0];

    return {
        type: ChartType.CARTESIAN,
        config: {
            layout: {
                xField: timeDimensionFieldId,
                yField: [metricFieldId],
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
};

/**
 * Hook that fetches metric data, executes the query, and builds visualization config
 *
 * This is the single source of truth for MetricExploreModalV2's data layer:
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
        return buildMetricQueryFromField(
            metricFieldQuery.data,
            timeDimensionConfig,
            segmentDimensionId,
            filterRule,
            effectiveDateRange,
            {
                dateFilterId: dateFilterIdRef.current,
                dimensionsFilterGroupId: dimensionsFilterGroupIdRef.current,
            },
            comparison,
        );
    }, [
        metricFieldQuery.data,
        timeDimensionConfig,
        segmentDimensionId,
        filterRule,
        effectiveDateRange,
        comparison,
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

    // 4. Build properties for VisualizationProvider
    const chartConfig = useMemo<ChartConfig>(() => {
        if (!metricQuery || !metricFieldQuery.data) {
            return { type: ChartType.CARTESIAN, config: undefined };
        }
        return buildLineChartConfig(metricQuery, metricFieldQuery.data.label);
    }, [metricQuery, metricFieldQuery.data]);

    const resultsData = useMemo(
        () => ({
            ...queryResults,
            metricQuery: createQuery.data?.metricQuery ?? metricQuery,
            fields: createQuery.data?.fields ?? {},
        }),
        [
            queryResults,
            createQuery.data?.metricQuery,
            createQuery.data?.fields,
            metricQuery,
        ],
    );

    const columnOrder = useMemo(() => {
        if (!metricQuery) return [];
        return [...metricQuery.dimensions, ...metricQuery.metrics];
    }, [metricQuery]);

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

    return {
        metricField: metricFieldQuery.data,
        explore: exploreQuery.data,
        metricQuery,
        timeDimensionConfig,
        effectiveDateRange,
        chartConfig,
        resultsData,
        columnOrder,
        isLoading,
        hasData,
        error,
    };
}
