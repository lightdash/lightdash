import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import weekOfYear from 'dayjs/plugin/weekOfYear';
import { type Dictionary } from 'lodash';
import groupBy from 'lodash/groupBy';
import mapKeys from 'lodash/mapKeys';
import { v4 as uuidv4 } from 'uuid';
import { castDateLiteral } from '../compiler/filtersCompiler';
import { type AnyType } from '../types/any';
import type {
    CatalogField,
    MetricWithAssociatedTimeDimension,
} from '../types/catalog';
import { type CompiledTable } from '../types/explore';
import {
    CustomDimensionType,
    DimensionType,
    MetricType,
    type CompiledDimension,
    type CompiledMetric,
    type CustomSqlDimension,
    type Dimension,
} from '../types/field';
import {
    FilterOperator,
    type DateFilterSettings,
    type FieldTarget,
    type FilterRule,
} from '../types/filter';
import {
    MetricExplorerComparison,
    type MetricExploreDataPoint,
    type MetricExplorerDateRange,
    type MetricExplorerQuery,
} from '../types/metricsExplorer';
import { type WarehouseTypes } from '../types/projects';
import type { ResultRow } from '../types/results';
import { TimeFrames, type DefaultTimeDimension } from '../types/timeFrames';
import assertUnreachable from './assertUnreachable';
import { getItemId } from './item';

dayjs.extend(isoWeek);
dayjs.extend(weekOfYear);

type DateFilter = FilterRule<
    FilterOperator,
    FieldTarget,
    unknown,
    DateFilterSettings
>;

type ImpelemntedTimeframe =
    | TimeFrames.DAY
    | TimeFrames.WEEK
    | TimeFrames.MONTH
    | TimeFrames.YEAR;

type UnimplementedTimeframe = Exclude<TimeFrames, ImpelemntedTimeframe>;

export const assertUnimplementedTimeframe = (
    timeframe: UnimplementedTimeframe,
): never => {
    switch (timeframe) {
        case TimeFrames.RAW:
        case TimeFrames.QUARTER:
        case TimeFrames.HOUR:
        case TimeFrames.MINUTE:
        case TimeFrames.SECOND:
        case TimeFrames.MILLISECOND:
        case TimeFrames.DAY_OF_WEEK_INDEX:
        case TimeFrames.DAY_OF_MONTH_NUM:
        case TimeFrames.DAY_OF_YEAR_NUM:
        case TimeFrames.WEEK_NUM:
        case TimeFrames.MONTH_NUM:
        case TimeFrames.QUARTER_NUM:
        case TimeFrames.YEAR_NUM:
        case TimeFrames.DAY_OF_WEEK_NAME:
        case TimeFrames.MONTH_NAME:
        case TimeFrames.QUARTER_NAME:
        case TimeFrames.HOUR_OF_DAY_NUM:
        case TimeFrames.MINUTE_OF_HOUR_NUM:
            throw new Error(
                `Timeframe "${timeframe}" is not supported for default time interval`,
            );
        default:
            return assertUnreachable(
                timeframe,
                `Unknown time interval: "${timeframe}"`,
            );
    }
};

export const getFieldIdForDateDimension = (
    fieldId: string,
    timeframe: TimeFrames,
) => {
    switch (timeframe) {
        case TimeFrames.DAY:
            return `${fieldId}_day`;
        case TimeFrames.WEEK:
            return `${fieldId}_week`;
        case TimeFrames.MONTH:
            return `${fieldId}_month`;
        case TimeFrames.YEAR:
            return `${fieldId}_year`;
        default:
            return assertUnimplementedTimeframe(timeframe);
    }
};

export const getDateCalcUtils = (timeFrame: TimeFrames, grain?: TimeFrames) => {
    switch (timeFrame) {
        case TimeFrames.MONTH:
            if (
                grain &&
                grain !== TimeFrames.DAY &&
                grain !== TimeFrames.MONTH
            ) {
                throw new Error(
                    `Granularity "${grain}" is not supported yet for this timeframe "${timeFrame}"`,
                );
            }

            return {
                forward: (date: Date) => dayjs(date).add(1, 'month').toDate(),
                back: (date: Date) => dayjs(date).subtract(1, 'month').toDate(),
            };
        case TimeFrames.DAY:
            if (grain && grain !== TimeFrames.DAY) {
                throw new Error(
                    `Granularity "${grain}" is not supported yet for this timeframe "${timeFrame}"`,
                );
            }
            return {
                forward: (date: Date) => dayjs(date).add(1, 'day').toDate(),
                back: (date: Date) => dayjs(date).subtract(1, 'day').toDate(),
            };
        case TimeFrames.WEEK:
            if (grain && grain !== TimeFrames.WEEK) {
                throw new Error(
                    `Granularity "${grain}" is not supported yet for this timeframe "${timeFrame}"`,
                );
            }
            return {
                forward: (date: Date) => dayjs(date).add(1, 'week').toDate(),
                back: (date: Date) => dayjs(date).subtract(1, 'week').toDate(),
            };
        case TimeFrames.YEAR:
            // Handle week shift for previous year comparison and subtract what the amount of weeks is in a year
            if (grain === TimeFrames.WEEK) {
                return {
                    forward: (date: Date) =>
                        dayjs(date)
                            // 52 weeks in a year
                            .add(52, 'weeks')
                            .startOf('isoWeek')
                            .toDate(),
                    back: (date: Date) =>
                        dayjs(date)
                            // 52 weeks in a year
                            .subtract(52, 'weeks')
                            .startOf('isoWeek')
                            .toDate(),
                };
            }
            return {
                forward: (date: Date) => dayjs(date).add(1, 'year').toDate(),
                back: (date: Date) => dayjs(date).subtract(1, 'year').toDate(),
            };
        default:
            return assertUnimplementedTimeframe(timeFrame);
    }
};

export const METRICS_EXPLORER_DATE_FORMAT = 'YYYY-MM-DD';

export const getDateRangeFromString = (
    dateRange: [string, string],
): MetricExplorerDateRange => [
    dayjs(dateRange[0], METRICS_EXPLORER_DATE_FORMAT).toDate(),
    dayjs(dateRange[1], METRICS_EXPLORER_DATE_FORMAT).toDate(),
];

// TODO: refine the time grain for each time frame
//   Time grain Year: -> past 5 years (i.e. 5 completed years + this uncompleted year)
//   Time grain Month -> past 12 months (i.e. 12 completed months + this uncompleted month)
//   Time grain Week -> past 12 weeks (i.e. 12 completed weeks + this uncompleted week)
//   Time grain Day -> past 30 days (i.e. 30 completed days + this uncompleted day)
// above sample is taken from the spec but the implementation is different for practical reasons for visualization
export const getGrainForDateRange = (
    dateRange: [Date, Date],
): ImpelemntedTimeframe => {
    const diff = dateRange[1].getTime() - dateRange[0].getTime();
    const days = diff / (1000 * 60 * 60 * 24);

    if (days <= 31 * 3) {
        return TimeFrames.DAY;
    }
    if (days <= 7 * 12) {
        return TimeFrames.WEEK;
    }
    if (days <= 31 * 12) {
        return TimeFrames.MONTH;
    }
    return TimeFrames.YEAR;
};

export const getMetricsExplorerSegmentFilters = (
    segmentDimension: string | null,
    segments: string[],
): FilterRule[] => {
    if (!segmentDimension || segments.length === 0) return [];

    return [
        {
            id: uuidv4(),
            target: { fieldId: segmentDimension },
            operator: FilterOperator.EQUALS,
            values: segments,
        },
    ];
};

export const getMetricExplorerDateRangeFilters = (
    timeDimensionConfig: TimeDimensionConfig,
    dateRange: MetricExplorerDateRange,
): DateFilter[] => {
    const targetFieldId = getItemId({
        table: timeDimensionConfig.table,
        name: getFieldIdForDateDimension(
            timeDimensionConfig.field,
            timeDimensionConfig.interval,
        ),
    });

    return [
        {
            id: uuidv4(),
            target: { fieldId: targetFieldId },
            operator: FilterOperator.IN_BETWEEN,
            values: dateRange.map((date) =>
                dayjs(date).format(METRICS_EXPLORER_DATE_FORMAT),
            ),
        },
    ];
};

// Parse the metric value to a number, returning null if it's not a number
export const parseMetricValue = (value: unknown): number | null => {
    if (value === null || value === undefined) return null;
    const parsed = Number(value);
    return Number.isNaN(parsed) ? null : parsed;
};

// we are assuming that the dimension value is a string and if it's not defined we just return null
// so actually `null` value will be converted to `"null"` string
const parseDimensionValue = (value: unknown): string | null => {
    if (value === undefined) return null;
    return String(value);
};

export const MAX_SEGMENT_DIMENSION_UNIQUE_VALUES = 10;

export const getMetricExplorerDataPoints = (
    dimension: Dimension,
    metric: MetricWithAssociatedTimeDimension,
    metricRows: Record<string, AnyType>[],
    segmentDimensionId: string | null,
): {
    dataPoints: Array<MetricExploreDataPoint>;
    isSegmentDimensionFiltered: boolean;
} => {
    const dimensionId = getItemId(dimension);
    const metricId = getItemId(metric);

    let filteredMetricRows = metricRows;
    let isSegmentDimensionFiltered = false;
    if (segmentDimensionId) {
        const countUniqueValues = new Set(
            metricRows.map((row) => row[segmentDimensionId]),
        ).size;

        if (countUniqueValues > MAX_SEGMENT_DIMENSION_UNIQUE_VALUES) {
            isSegmentDimensionFiltered = true;
            const first10Values = Array.from(
                new Set(metricRows.map((row) => row[segmentDimensionId])),
            ).slice(0, MAX_SEGMENT_DIMENSION_UNIQUE_VALUES);
            filteredMetricRows = metricRows.filter((row) =>
                first10Values.includes(row[segmentDimensionId]),
            );
        }
    }

    const groupByMetricRows = groupBy(filteredMetricRows, (row) =>
        new Date(String(row[dimensionId])).toISOString(),
    );

    const dataPoints = Object.entries(groupByMetricRows).flatMap(
        ([date, rows]) =>
            rows.map((row) => {
                const segmentValue = segmentDimensionId
                    ? parseDimensionValue(row[segmentDimensionId])
                    : null;

                return {
                    date: new Date(date),
                    segment: segmentValue,
                    metric: {
                        value: parseMetricValue(row[metricId]),
                        label: segmentValue ?? metric.label ?? metric.name,
                    },
                    compareMetric: {
                        value: null,
                        label: null,
                    },
                };
            }),
    );

    return {
        dataPoints,
        isSegmentDimensionFiltered,
    };
};

function offsetWeekCompareDates(
    groupByCompareMetricRows: Dictionary<ResultRow[]>,
    timeFrame: TimeFrames.WEEK,
) {
    return Object.fromEntries(
        Object.keys(groupByCompareMetricRows).map((compareDate) => {
            const compareDateWeek = dayjs(compareDate).week();
            const compareDateNextYear = getDateCalcUtils(
                TimeFrames.YEAR,
                timeFrame,
            ).forward(new Date(compareDate));

            const adjustedCompareDate = dayjs(compareDateNextYear)
                .week(compareDateWeek)
                .startOf('isoWeek')
                .toISOString();

            return [compareDate, adjustedCompareDate];
        }),
    );
}

export const getMetricExplorerDataPointsWithCompare = (
    dimension: Dimension,
    compareDimension: Dimension,
    metric: MetricWithAssociatedTimeDimension,
    metricRows: Record<string, AnyType>[],
    compareMetricRows: Record<string, AnyType>[],
    query: MetricExplorerQuery,
    timeFrame: TimeFrames,
): {
    dataPoints: Array<MetricExploreDataPoint>;
} => {
    if (query.comparison === MetricExplorerComparison.NONE) {
        throw new Error('Comparison type is required');
    }

    const metricId = getItemId(metric);

    const dimensionId = getItemId(dimension);
    const compareDimensionId = getItemId(compareDimension);

    const groupByMetricRows = groupBy(metricRows, (row) =>
        new Date(String(row[dimensionId])).toISOString(),
    );
    const groupByCompareMetricRows = groupBy(compareMetricRows, (row) =>
        new Date(String(row[compareDimensionId])).toISOString(),
    );

    const offsetGroupByCompareMetricRows = mapKeys(
        groupByCompareMetricRows,
        (_, date) => {
            if (query.comparison === MetricExplorerComparison.PREVIOUS_PERIOD) {
                if (timeFrame === TimeFrames.WEEK) {
                    return offsetWeekCompareDates(
                        groupByCompareMetricRows,
                        timeFrame,
                    )[date];
                }

                return getDateCalcUtils(TimeFrames.YEAR, timeFrame)
                    .forward(new Date(date))
                    .toISOString();
            }
            return date;
        },
    );

    const dates = new Set([
        ...Object.keys(groupByMetricRows),
        ...Object.keys(offsetGroupByCompareMetricRows),
    ]);

    const compareMetricId =
        query.comparison === MetricExplorerComparison.PREVIOUS_PERIOD
            ? metricId
            : getItemId({
                  table: query.metric.table,
                  name: query.metric.name,
              });

    let comparisonMetricLabel: string | null = null;
    if (query.comparison === MetricExplorerComparison.DIFFERENT_METRIC) {
        comparisonMetricLabel = query.metric.label ?? query.metric.name;
    } else if (query.comparison === MetricExplorerComparison.PREVIOUS_PERIOD) {
        comparisonMetricLabel = 'Previous Period';
    }

    const dataPoints = Array.from(dates).map((date) => ({
        date: new Date(date),
        segment: null,
        metric: {
            value: parseMetricValue(groupByMetricRows[date]?.[0]?.[metricId]),
            label: metric.label ?? metric.name,
        },
        compareMetric: {
            value: parseMetricValue(
                offsetGroupByCompareMetricRows[date]?.[0]?.[compareMetricId],
            ),
            label: comparisonMetricLabel,
        },
    }));

    return { dataPoints };
};

/**
 * Get the date range for a given time interval, based on the current date and the time interval
 * Time grain Year: -> past 3 years (i.e. 3 completed years + this uncompleted year)
 * Time grain Month -> past 12 months (i.e. 12 completed months + this uncompleted month)
 * Time grain Week -> past 12 weeks (i.e. 12 completed weeks + this uncompleted week)
 * Time grain Day -> past 30 days (i.e. 30 completed days + this uncompleted day)
 * @param timeInterval - The time interval
 * @returns The date range
 */
export const getDefaultDateRangeFromInterval = (
    timeInterval: TimeFrames,
): MetricExplorerDateRange => {
    const now = dayjs();

    switch (timeInterval) {
        case TimeFrames.DAY:
            return [
                now.subtract(30, 'day').startOf('day').toDate(),
                now.toDate(),
            ];
        case TimeFrames.WEEK:
            return [
                now.subtract(12, 'week').startOf('isoWeek').toDate(),
                now.toDate(),
            ];
        case TimeFrames.MONTH:
            return [
                now.subtract(12, 'month').startOf('month').toDate(),
                now.toDate(),
            ];
        case TimeFrames.YEAR:
            return [
                now.subtract(3, 'year').startOf('year').toDate(),
                now.toDate(),
            ];
        default:
            return assertUnimplementedTimeframe(timeInterval);
    }
};

export const getDefaultMetricTreeNodeDateRange = (
    timeFrame: TimeFrames,
): MetricExplorerDateRange => {
    const now = dayjs();

    switch (timeFrame) {
        case TimeFrames.DAY:
            return [
                now.startOf('day').subtract(1, 'day').toDate(),
                now.endOf('day').subtract(1, 'day').toDate(),
            ];
        case TimeFrames.WEEK:
            return [now.startOf('isoWeek').toDate(), now.toDate()];
        case TimeFrames.MONTH:
            return [now.startOf('month').toDate(), now.toDate()];
        case TimeFrames.YEAR:
            return [now.startOf('year').toDate(), now.toDate()];
        default:
            return assertUnimplementedTimeframe(timeFrame);
    }
};

/**
 * Default time interval to use when no time interval is provided.
 * For example, when there is no default time dimension defined for a metric or table.
 */
export const DEFAULT_METRICS_EXPLORER_TIME_INTERVAL = TimeFrames.MONTH;

export type TimeDimensionConfig = DefaultTimeDimension & { table: string };

export const getFirstAvailableTimeDimension = (
    metric: MetricWithAssociatedTimeDimension,
): TimeDimensionConfig | undefined => {
    if (
        metric.availableTimeDimensions &&
        metric.availableTimeDimensions.length > 0
    ) {
        return {
            table: metric.availableTimeDimensions[0].table,
            field: metric.availableTimeDimensions[0].name,
            interval: DEFAULT_METRICS_EXPLORER_TIME_INTERVAL,
        };
    }
    return undefined;
};

export const getDefaultTimeDimension = (
    metric: CompiledMetric,
    table?: CompiledTable,
): DefaultTimeDimension | undefined => {
    // Priority 1: Use metric-level default time dimension if defined in yml
    if (metric.defaultTimeDimension) {
        return {
            field: metric.defaultTimeDimension.field,
            interval:
                metric.defaultTimeDimension.interval ??
                DEFAULT_METRICS_EXPLORER_TIME_INTERVAL,
        };
    }

    // Priority 2: Use model-level default time dimension if defined in yml
    if (table?.defaultTimeDimension) {
        return {
            field: table.defaultTimeDimension.field,
            interval:
                table.defaultTimeDimension.interval ??
                DEFAULT_METRICS_EXPLORER_TIME_INTERVAL,
        };
    }

    // Priority 3: Use the only time dimension if there's exactly one
    if (table?.dimensions) {
        const timeDimensions = Object.values(table.dimensions).filter(
            (dim) =>
                (dim.type === DimensionType.DATE ||
                    dim.type === DimensionType.TIMESTAMP) &&
                !!dim.isIntervalBase &&
                !dim.hidden,
        );
        if (timeDimensions.length === 1) {
            return {
                field: timeDimensions[0].name,
                interval: DEFAULT_METRICS_EXPLORER_TIME_INTERVAL,
            };
        }
    }

    return undefined;
};

export const getAvailableTimeDimensionsFromTables = (
    tables: Record<string, CompiledTable>,
): (CompiledDimension & {
    type: DimensionType.DATE | DimensionType.TIMESTAMP;
})[] =>
    Object.values(tables).flatMap((table) =>
        Object.values(table.dimensions).filter(
            (
                dim,
            ): dim is CompiledDimension & {
                type: DimensionType.DATE | DimensionType.TIMESTAMP;
            } =>
                (dim.type === DimensionType.DATE ||
                    dim.type === DimensionType.TIMESTAMP) &&
                !!dim.isIntervalBase &&
                !dim.hidden,
        ),
    );

/**
 * Returns dimensions that can be used for filtering based on type constraints only.
 * Only STRING and BOOLEAN dimensions are allowed, excluding time-derived dimensions.
 * Does NOT apply spotlight settings - frontend handles that with metric allowlist.
 */
export const getTypeValidFilterDimensions = (
    dimensions: CompiledDimension[],
): CompiledDimension[] =>
    dimensions.filter((d) => {
        // Exclude date-derived dimensions (month name, day name, etc.) even though they're strings
        if (d.timeIntervalBaseDimensionName) return false;
        return (
            d.type === DimensionType.STRING || d.type === DimensionType.BOOLEAN
        );
    });

/**
 * Filters dimensions for a specific metric, applying metric's spotlight allowlist.
 * Dimensions should already be type-valid from the backend.
 */
export const getFilterDimensionsForMetric = (
    dimensions: CompiledDimension[],
    metric: Pick<CatalogField, 'spotlightFilterBy'> | undefined,
): CompiledDimension[] =>
    dimensions.filter((d) => {
        // If metric has allowlist, use it (supersedes dimension-level)
        if (metric?.spotlightFilterBy) {
            return metric.spotlightFilterBy.includes(d.name);
        }
        // Otherwise use dimension-level setting
        return d.spotlight?.filterBy !== false;
    });

/**
 * Returns dimensions that can be used for segmenting based on type constraints only.
 * Only STRING and BOOLEAN dimensions are allowed, excluding time-derived dimensions.
 * Does NOT apply spotlight settings - frontend handles that with metric allowlist.
 */
export const getTypeValidSegmentDimensions = (
    dimensions: CompiledDimension[],
): CompiledDimension[] =>
    dimensions.filter((d) => {
        // Exclude date-derived dimensions (month name, day name, etc.) even though they're strings
        if (d.timeIntervalBaseDimensionName) return false;
        return (
            d.type === DimensionType.STRING || d.type === DimensionType.BOOLEAN
        );
    });

/**
 * Filters dimensions for a specific metric, applying metric's spotlight allowlist.
 * Dimensions should already be type-valid from the backend.
 */
export const getSegmentDimensionsForMetric = (
    dimensions: CompiledDimension[],
    metric: Pick<CatalogField, 'spotlightSegmentBy'> | undefined,
): CompiledDimension[] =>
    dimensions.filter((d) => {
        // If metric has allowlist, use it (supersedes dimension-level)
        if (metric?.spotlightSegmentBy) {
            return metric.spotlightSegmentBy.includes(d.name);
        }
        // Otherwise use dimension-level setting
        return d.spotlight?.segmentBy !== false;
    });

export const getAvailableCompareMetrics = (
    metrics: MetricWithAssociatedTimeDimension[],
): MetricWithAssociatedTimeDimension[] =>
    metrics
        .filter((metric) => !!metric.timeDimension)
        .filter(
            (metric) =>
                metric.type !== MetricType.STRING &&
                metric.type !== MetricType.BOOLEAN &&
                metric.type !== MetricType.DATE &&
                metric.type !== MetricType.TIMESTAMP,
        );

/**
 * Calculate date ranges for rolling period comparisons.
 * Current period: yesterday - (days-1) days ago to yesterday
 * Previous period: (days*2) days ago to (days+1) days ago
 *
 * Example for 7 days (if today is Feb 4):
 * Current:  Jan 28 - Feb 3
 * Previous: Jan 21 - Jan 27
 */
export const getRollingPeriodDates = (days: number) => {
    const now = dayjs();
    const yesterday = now.subtract(1, 'day').endOf('day');

    return {
        current: {
            start: now.subtract(days, 'day').startOf('day'),
            end: yesterday,
        },
        previous: {
            start: now.subtract(days * 2, 'day').startOf('day'),
            end: now.subtract(days + 1, 'day').endOf('day'),
        },
    };
};

/**
 * Build a custom SQL dimension that buckets data into periods:
 * - 0 = current period
 * - 1 = previous period
 * - NULL = outside both periods
 */
export const buildRollingPeriodCustomDimension = (
    timeDimensionFieldRef: string, // e.g., "${orders.order_date_day}"
    table: string,
    rollingDays: number,
    adapterType: WarehouseTypes,
): CustomSqlDimension => {
    const { current, previous } = getRollingPeriodDates(rollingDays);

    const cast = (d: dayjs.Dayjs) =>
        castDateLiteral(d.format(METRICS_EXPLORER_DATE_FORMAT), adapterType);

    const id = 'lightdash_metric_total_period';

    return {
        id,
        name: id,
        table,
        type: CustomDimensionType.SQL,
        sql: `CASE
  WHEN ${timeDimensionFieldRef} >= ${cast(current.start)} AND ${timeDimensionFieldRef} <= ${cast(current.end)} THEN 0
  WHEN ${timeDimensionFieldRef} >= ${cast(previous.start)} AND ${timeDimensionFieldRef} <= ${cast(previous.end)} THEN 1
  ELSE NULL
END`,
        dimensionType: DimensionType.NUMBER,
    };
};
