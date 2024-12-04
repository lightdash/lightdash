import dayjs from 'dayjs';
import { groupBy, mapKeys } from 'lodash';
import { v4 as uuidv4 } from 'uuid';
import type { MetricWithAssociatedTimeDimension } from '../types/catalog';
import { ConditionalOperator } from '../types/conditionalRule';
import { type CompiledTable } from '../types/explore';
import type { Dimension } from '../types/field';
import {
    DimensionType,
    type CompiledDimension,
    type CompiledMetric,
} from '../types/field';
import {
    type DateFilterSettings,
    type FieldTarget,
    type FilterRule,
} from '../types/filter';
import {
    MetricExplorerComparison,
    type MetricExploreDataPoint,
    type MetricExplorerComparisonType,
    type MetricExplorerDateRange,
} from '../types/metricsExplorer';
import type { ResultRow } from '../types/results';
import { TimeFrames, type DefaultTimeDimension } from '../types/timeFrames';
import assertUnreachable from './assertUnreachable';
import { getItemId } from './item';

type DateFilter = FilterRule<
    ConditionalOperator,
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

const assertUnimplementedTimeframe = (
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

export const oneYearBack = (date: Date) =>
    dayjs(date)
        .set('year', dayjs(date).get('year') - 1)
        .toDate();

export const oneYearForward = (date: Date) =>
    dayjs(date)
        .set('year', dayjs(date).get('year') + 1)
        .toDate();

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

export const getMetricExplorerDateRangeFilters = (
    exploreName: string,
    dimensionName: string,
    dateRange: MetricExplorerDateRange,
): DateFilter[] => {
    const defaultGrain = getGrainForDateRange(dateRange);
    const targetFieldId = getItemId({
        table: exploreName,
        name: getFieldIdForDateDimension(dimensionName, defaultGrain),
    });

    return [
        {
            id: uuidv4(),
            target: { fieldId: targetFieldId },
            operator: ConditionalOperator.IN_BETWEEN,
            values: dateRange,
        },
    ];
};

export const getMetricExplorerDataPoints = (
    dimension: Dimension,
    metric: MetricWithAssociatedTimeDimension,
    metricRows: ResultRow[],
): Array<MetricExploreDataPoint> => {
    const dimensionId = getItemId(dimension);
    const metricId = getItemId(metric);

    const groupByMetricRows = groupBy(metricRows, (row) =>
        new Date(String(row[dimensionId].value.raw)).toString(),
    );

    return Object.keys(groupByMetricRows).map((date) => ({
        date: new Date(date),
        metric: groupByMetricRows[date]?.[0]?.[metricId]?.value.raw ?? null,
        compareMetric: null,
    }));
};

export const getMetricExplorerDataPointsWithCompare = (
    dimension: Dimension,
    metric: MetricWithAssociatedTimeDimension,
    metricRows: ResultRow[],
    compareMetricRows: ResultRow[],
    comparison: MetricExplorerComparisonType,
): Array<MetricExploreDataPoint> => {
    if (comparison.type === MetricExplorerComparison.NONE) {
        throw new Error('Comparison type is required');
    }

    const dimensionId = getItemId(dimension);
    const metricId = getItemId(metric);

    const mapDateField = (row: ResultRow) =>
        new Date(String(row[dimensionId].value.raw)).toString();

    const groupByMetricRows = groupBy(metricRows, (row) => mapDateField(row));

    const groupByCompareMetricRows = groupBy(compareMetricRows, (row) =>
        mapDateField(row),
    );

    const offsetGroupByCompareMetricRows = mapKeys(
        groupByCompareMetricRows,
        (_, date) =>
            comparison.type === MetricExplorerComparison.PREVIOUS_PERIOD
                ? oneYearForward(new Date(date)).toString()
                : date,
    );

    const dates = new Set([
        ...Object.keys(groupByMetricRows),
        ...Object.keys(offsetGroupByCompareMetricRows),
    ]);

    const compareMetricId =
        comparison.type === MetricExplorerComparison.PREVIOUS_PERIOD
            ? metricId
            : getItemId({
                  table: comparison.metricTable,
                  name: comparison.metricName,
              });

    return Array.from(dates).map((date) => ({
        date: new Date(date),
        metric: groupByMetricRows[date]?.[0]?.[metricId]?.value.raw ?? null,
        compareMetric:
            offsetGroupByCompareMetricRows[date]?.[0]?.[compareMetricId]?.value
                .raw ?? null,
    }));
};

/**
 * Get the date range for a given time interval, based on the current date and the time interval
 * Time grain Year: -> past 5 years (i.e. 5 completed years + this uncompleted year)
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
                now.subtract(29, 'day').startOf('day').toDate(),
                now.toDate(),
            ];
        case TimeFrames.WEEK:
            return [
                now.subtract(11, 'week').startOf('week').toDate(),
                now.toDate(),
            ];
        case TimeFrames.MONTH:
            return [
                now.subtract(11, 'month').startOf('month').toDate(),
                now.toDate(),
            ];
        case TimeFrames.YEAR:
            return [
                now.subtract(4, 'year').startOf('year').toDate(),
                now.toDate(),
            ];
        default:
            return assertUnimplementedTimeframe(timeInterval);
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
        return metric.defaultTimeDimension;
    }

    // Priority 2: Use model-level default time dimension if defined in yml
    if (table?.defaultTimeDimension) {
        return table.defaultTimeDimension;
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
