import { DimensionType, type CompiledDimension } from '../../types/field';
import { TimeFrames } from '../../types/timeFrames';
import assertUnreachable from '../../utils/assertUnreachable';

export enum TimeFrameDerivability {
    DERIVABLE = 'derivable',
    QUERY_GRANULARITY_TOO_FINE = 'query_granularity_too_fine',
    NON_NESTING = 'non_nesting',
}

const NESTING_TIME_FRAMES: readonly TimeFrames[] = [
    TimeFrames.RAW,
    TimeFrames.MILLISECOND,
    TimeFrames.SECOND,
    TimeFrames.MINUTE,
    TimeFrames.HOUR,
    TimeFrames.DAY,
    TimeFrames.MONTH,
    TimeFrames.QUARTER,
    TimeFrames.YEAR,
];

const PRE_AGGREGATE_GRANULARITY_RANK: Record<TimeFrames, number> = {
    [TimeFrames.RAW]: 0,
    [TimeFrames.MILLISECOND]: 1,
    [TimeFrames.SECOND]: 2,
    [TimeFrames.MINUTE]: 3,
    [TimeFrames.MINUTE_OF_HOUR_NUM]: 3,
    [TimeFrames.HOUR]: 4,
    [TimeFrames.HOUR_OF_DAY_NUM]: 4,
    [TimeFrames.DAY]: 5,
    [TimeFrames.DAY_OF_WEEK_INDEX]: 5,
    [TimeFrames.DAY_OF_WEEK_NAME]: 5,
    [TimeFrames.DAY_OF_MONTH_NUM]: 5,
    [TimeFrames.DAY_OF_YEAR_NUM]: 5,
    [TimeFrames.WEEK]: 6,
    [TimeFrames.WEEK_NUM]: 6,
    [TimeFrames.MONTH]: 7,
    [TimeFrames.MONTH_NUM]: 7,
    [TimeFrames.MONTH_NAME]: 7,
    [TimeFrames.QUARTER]: 8,
    [TimeFrames.QUARTER_NUM]: 8,
    [TimeFrames.QUARTER_NAME]: 8,
    [TimeFrames.YEAR]: 9,
    [TimeFrames.YEAR_NUM]: 9,
};

const getNestingIndex = (timeFrame: TimeFrames): number =>
    NESTING_TIME_FRAMES.indexOf(timeFrame);

const getNestedDerivability = (
    queryTimeFrame: TimeFrames,
    storedTimeFrame: TimeFrames,
): TimeFrameDerivability => {
    const queryIndex = getNestingIndex(queryTimeFrame);
    const storedIndex = getNestingIndex(storedTimeFrame);

    if (storedTimeFrame === TimeFrames.WEEK) {
        return queryIndex <= getNestingIndex(TimeFrames.DAY)
            ? TimeFrameDerivability.QUERY_GRANULARITY_TOO_FINE
            : TimeFrameDerivability.NON_NESTING;
    }
    if (queryIndex === -1 || storedIndex === -1) {
        return TimeFrameDerivability.NON_NESTING;
    }
    return queryIndex >= storedIndex
        ? TimeFrameDerivability.DERIVABLE
        : TimeFrameDerivability.QUERY_GRANULARITY_TOO_FINE;
};

const getMaximumStoredTimeFrameDerivability = (
    maximumStoredTimeFrame: TimeFrames,
    storedTimeFrame: TimeFrames,
): TimeFrameDerivability => {
    if (storedTimeFrame === TimeFrames.WEEK) {
        return TimeFrameDerivability.NON_NESTING;
    }

    return getNestedDerivability(maximumStoredTimeFrame, storedTimeFrame);
};

export const getTimeFrameDerivability = (
    queryTimeFrame: TimeFrames,
    storedTimeFrame: TimeFrames,
): TimeFrameDerivability => {
    if (queryTimeFrame === storedTimeFrame) {
        return TimeFrameDerivability.DERIVABLE;
    }

    switch (queryTimeFrame) {
        case TimeFrames.RAW:
            return TimeFrameDerivability.QUERY_GRANULARITY_TOO_FINE;
        case TimeFrames.MILLISECOND:
        case TimeFrames.SECOND:
        case TimeFrames.MINUTE:
        case TimeFrames.HOUR:
        case TimeFrames.DAY:
        case TimeFrames.MONTH:
        case TimeFrames.QUARTER:
        case TimeFrames.YEAR:
            return getNestedDerivability(queryTimeFrame, storedTimeFrame);
        case TimeFrames.WEEK:
            return getMaximumStoredTimeFrameDerivability(
                TimeFrames.DAY,
                storedTimeFrame,
            );
        case TimeFrames.DAY_OF_WEEK_INDEX:
        case TimeFrames.DAY_OF_WEEK_NAME:
        case TimeFrames.DAY_OF_MONTH_NUM:
        case TimeFrames.DAY_OF_YEAR_NUM:
        case TimeFrames.WEEK_NUM:
            return getMaximumStoredTimeFrameDerivability(
                TimeFrames.DAY,
                storedTimeFrame,
            );
        case TimeFrames.MONTH_NUM:
        case TimeFrames.MONTH_NAME:
            return getMaximumStoredTimeFrameDerivability(
                TimeFrames.MONTH,
                storedTimeFrame,
            );
        case TimeFrames.QUARTER_NUM:
        case TimeFrames.QUARTER_NAME:
            return getMaximumStoredTimeFrameDerivability(
                TimeFrames.QUARTER,
                storedTimeFrame,
            );
        case TimeFrames.YEAR_NUM:
            return getMaximumStoredTimeFrameDerivability(
                TimeFrames.YEAR,
                storedTimeFrame,
            );
        case TimeFrames.HOUR_OF_DAY_NUM:
            return getMaximumStoredTimeFrameDerivability(
                TimeFrames.HOUR,
                storedTimeFrame,
            );
        case TimeFrames.MINUTE_OF_HOUR_NUM:
            return getMaximumStoredTimeFrameDerivability(
                TimeFrames.MINUTE,
                storedTimeFrame,
            );
        default:
            return assertUnreachable(
                queryTimeFrame,
                `Unsupported query time frame "${queryTimeFrame}"`,
            );
    }
};

export const getEffectiveDimensionTimeFrame = (
    dimension: Pick<CompiledDimension, 'timeInterval' | 'type'>,
): TimeFrames =>
    dimension.timeInterval ??
    (dimension.type === DimensionType.DATE ? TimeFrames.DAY : TimeFrames.RAW);

export const getPreAggregateGranularityRank = (
    granularity: TimeFrames,
): number => PRE_AGGREGATE_GRANULARITY_RANK[granularity];
