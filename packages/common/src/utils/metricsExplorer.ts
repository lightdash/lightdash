import { v4 as uuidv4 } from 'uuid';
import { ConditionalOperator } from '../types/conditionalRule';
import {
    UnitOfTime,
    type DateFilterSettings,
    type FieldTarget,
    type FilterRule,
} from '../types/filter';
import type { MetricExplorerDateRange } from '../types/metricsExplorer';
import { TimeFrames } from '../types/timeFrames';
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

// Time grain Year: -> past 5 years (i.e. 5 completed years + this uncompleted year)
// Time grain Month -> past 12 months (i.e. 12 completed months + this uncompleted month)
// Time grain Week -> past 12 weeks (i.e. 12 completed weeks + this uncompleted week)
// Time grain Day -> past 30 days (i.e. 30 completed days + this uncompleted day)
export const getMetricExplorerDefaultGrainFilters = (
    exploreName: string,
    dimensionName: string,
    timeInterval: TimeFrames | undefined,
): DateFilter[] => {
    const fieldWithGrain = timeInterval
        ? getFieldIdForDateDimension(dimensionName, timeInterval)
        : dimensionName;

    const targetFieldId = getItemId({
        table: exploreName,
        name: fieldWithGrain,
    });

    if (!timeInterval) {
        throw new Error('Time interval is required to get relevant filter');
    }

    switch (timeInterval) {
        case TimeFrames.DAY:
            return [
                {
                    id: uuidv4(),
                    target: { fieldId: targetFieldId },
                    operator: ConditionalOperator.IN_THE_PAST,
                    values: [29], // 30 days ago - current day
                    settings: {
                        unitOfTime: UnitOfTime.days,
                        completed: true,
                    },
                },
                {
                    id: uuidv4(),
                    target: { fieldId: targetFieldId },
                    operator: ConditionalOperator.IN_THE_CURRENT,
                    values: [],
                    settings: { unitOfTime: UnitOfTime.days },
                },
            ];
        case TimeFrames.WEEK:
            return [
                {
                    id: uuidv4(),
                    target: { fieldId: targetFieldId },
                    operator: ConditionalOperator.IN_THE_PAST,
                    values: [11], // 12 weeks ago - current week
                    settings: {
                        unitOfTime: UnitOfTime.weeks,
                        completed: true,
                    },
                },
                {
                    id: uuidv4(),
                    target: { fieldId: targetFieldId },
                    operator: ConditionalOperator.IN_THE_CURRENT,
                    values: [],
                    settings: { unitOfTime: UnitOfTime.weeks },
                },
            ];
        case TimeFrames.MONTH:
            return [
                {
                    id: uuidv4(),
                    target: { fieldId: targetFieldId },
                    operator: ConditionalOperator.IN_THE_PAST,
                    values: [11], // 12 months ago - current month
                    settings: {
                        unitOfTime: UnitOfTime.months,
                        completed: true,
                    },
                },
                {
                    id: uuidv4(),
                    target: { fieldId: targetFieldId },
                    operator: ConditionalOperator.IN_THE_CURRENT,
                    values: [],
                    settings: { unitOfTime: UnitOfTime.months },
                },
            ];
        case TimeFrames.YEAR:
            return [
                {
                    id: uuidv4(),
                    target: { fieldId: targetFieldId },
                    operator: ConditionalOperator.IN_THE_PAST,
                    values: [4], // 5 years ago - current year
                    settings: { unitOfTime: UnitOfTime.years, completed: true },
                },
                {
                    id: uuidv4(),
                    target: { fieldId: targetFieldId },
                    operator: ConditionalOperator.IN_THE_CURRENT,
                    values: [],
                    settings: { unitOfTime: UnitOfTime.years },
                },
            ];
        default:
            return assertUnimplementedTimeframe(timeInterval);
    }
};

// Time grain Year: -> 10 years ago - 5 years ago
// Time grain Month -> 24 months ago - 12 months ago
// Time grain Week -> 24 weeks ago - 12 weeks ago
// Time grain Day -> 60 days ago - 30 days ago
export const getMetricExplorerDimensionPreviousFilters = (
    exploreName: string,
    dimensionName: string,
    timeInterval: TimeFrames | undefined,
): DateFilter[] => {
    const targetFieldId = getItemId({
        table: exploreName,
        name: dimensionName,
    });

    if (!timeInterval) {
        throw new Error('Time interval is required to get relevant filter');
    }

    switch (timeInterval) {
        case TimeFrames.DAY:
            // 60 days ago - 30 days ago
            return [
                {
                    id: uuidv4(),
                    target: { fieldId: targetFieldId },
                    operator: ConditionalOperator.IN_THE_PAST,
                    values: [60],
                    settings: {
                        unitOfTime: UnitOfTime.days,
                        completed: true,
                    },
                },
                {
                    id: uuidv4(),
                    target: { fieldId: targetFieldId },
                    operator: ConditionalOperator.NOT_IN_THE_PAST,
                    values: [30],
                    settings: {
                        unitOfTime: UnitOfTime.days,
                        completed: true,
                    },
                },
            ];
        case TimeFrames.WEEK:
            // 24 weeks ago - 12 weeks ago
            return [
                {
                    id: uuidv4(),
                    target: { fieldId: targetFieldId },
                    operator: ConditionalOperator.IN_THE_PAST,
                    values: [24],
                    settings: {
                        unitOfTime: UnitOfTime.weeks,
                        completed: true,
                    },
                },
                {
                    id: uuidv4(),
                    target: { fieldId: targetFieldId },
                    operator: ConditionalOperator.NOT_IN_THE_PAST,
                    values: [12],
                    settings: {
                        unitOfTime: UnitOfTime.weeks,
                        completed: true,
                    },
                },
            ];
        case TimeFrames.MONTH:
            // 24 months ago - 12 months ago
            return [
                {
                    id: uuidv4(),
                    target: { fieldId: targetFieldId },
                    operator: ConditionalOperator.IN_THE_PAST,
                    values: [24],
                    settings: {
                        unitOfTime: UnitOfTime.months,
                        completed: true,
                    },
                },
                {
                    id: uuidv4(),
                    target: { fieldId: targetFieldId },
                    operator: ConditionalOperator.NOT_IN_THE_PAST,
                    values: [12],
                    settings: {
                        unitOfTime: UnitOfTime.months,
                        completed: true,
                    },
                },
            ];
        case TimeFrames.YEAR:
            // 10 years ago - 5 years ago
            return [
                {
                    id: uuidv4(),
                    target: { fieldId: targetFieldId },
                    operator: ConditionalOperator.IN_THE_PAST,
                    values: [10],
                    settings: {
                        unitOfTime: UnitOfTime.years,
                        completed: true,
                    },
                },
                {
                    id: uuidv4(),
                    target: { fieldId: targetFieldId },
                    operator: ConditionalOperator.NOT_IN_THE_PAST,
                    values: [5],
                    settings: {
                        unitOfTime: UnitOfTime.years,
                        completed: true,
                    },
                },
            ];
        default:
            return assertUnimplementedTimeframe(timeInterval);
    }
};

// Time grain Year: -> past 5 years (i.e. 5 completed years + this uncompleted year)
// Time grain Month -> past 12 months (i.e. 12 completed months + this uncompleted month)
// Time grain Week -> past 12 weeks (i.e. 12 completed weeks + this uncompleted week)
// Time grain Day -> past 30 days (i.e. 30 completed days + this uncompleted day)
const getGrainForDateRange = (
    dateRange: [Date, Date],
): ImpelemntedTimeframe => {
    const diff = dateRange[1].getTime() - dateRange[0].getTime();
    const days = diff / (1000 * 60 * 60 * 24);

    if (days <= 31) {
        return TimeFrames.DAY;
    }
    if (days <= 7 * 12) {
        return TimeFrames.WEEK;
    }
    if (days <= 366) {
        return TimeFrames.MONTH;
    }

    return TimeFrames.YEAR;
};

export const getMetricExplorerDateRangeFilters = (
    exploreName: string,
    dimensionName: string,
    [startDate, endDate]: MetricExplorerDateRange,
): DateFilter[] => {
    if (!startDate || !endDate) {
        return [];
    }

    const defaultGrain = getGrainForDateRange([startDate, endDate]);

    const targetFieldId = getItemId({
        table: exploreName,
        name: getFieldIdForDateDimension(dimensionName, defaultGrain),
    });

    return [
        {
            id: uuidv4(),
            target: { fieldId: targetFieldId },
            operator: ConditionalOperator.IN_BETWEEN,
            values: [startDate, endDate],
        },
    ];
};
