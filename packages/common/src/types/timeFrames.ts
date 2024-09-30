// eslint-disable-next-line import/prefer-default-export
export enum TimeFrames {
    RAW = 'RAW',

    YEAR = 'YEAR',
    QUARTER = 'QUARTER',
    MONTH = 'MONTH',
    WEEK = 'WEEK',
    DAY = 'DAY',
    HOUR = 'HOUR',
    MINUTE = 'MINUTE',
    SECOND = 'SECOND',
    MILLISECOND = 'MILLISECOND',

    DAY_OF_WEEK_INDEX = 'DAY_OF_WEEK_INDEX',
    DAY_OF_MONTH_NUM = 'DAY_OF_MONTH_NUM',
    DAY_OF_YEAR_NUM = 'DAY_OF_YEAR_NUM',
    WEEK_NUM = 'WEEK_NUM',
    MONTH_NUM = 'MONTH_NUM',
    QUARTER_NUM = 'QUARTER_NUM',
    YEAR_NUM = 'YEAR_NUM',
    DAY_OF_WEEK_NAME = 'DAY_OF_WEEK_NAME',
    MONTH_NAME = 'MONTH_NAME',
    QUARTER_NAME = 'QUARTER_NAME',
    HOUR_OF_DAY_NUM = 'HOUR_OF_DAY_NUM',
    MINUTE_OF_HOUR_NUM = 'MINUTE_OF_HOUR_NUM',
}

export enum DateGranularity {
    DAY = 'Day',
    WEEK = 'Week',
    MONTH = 'Month',
    QUARTER = 'Quarter',
    YEAR = 'Year',
}

export const dateGranularityToTimeFrameMap: Record<
    DateGranularity,
    TimeFrames
> = {
    [DateGranularity.DAY]: TimeFrames.DAY,
    [DateGranularity.WEEK]: TimeFrames.WEEK,
    [DateGranularity.MONTH]: TimeFrames.MONTH,
    [DateGranularity.QUARTER]: TimeFrames.QUARTER,
    [DateGranularity.YEAR]: TimeFrames.YEAR,
};
