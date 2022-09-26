import { DimensionType } from '../types/field';
import { TimeFrames } from '../types/timeFrames';

type TimeFrameConfig = {
    getDimensionType: (fallback: DimensionType) => DimensionType;
};

// eslint-disable-next-line import/prefer-default-export
export const timeFrameConfigs: Record<TimeFrames, TimeFrameConfig> = {
    RAW: {
        getDimensionType: (fallback) => fallback,
    },
    MILLISECOND: {
        getDimensionType: () => DimensionType.TIMESTAMP,
    },
    SECOND: {
        getDimensionType: () => DimensionType.TIMESTAMP,
    },
    MINUTE: {
        getDimensionType: () => DimensionType.TIMESTAMP,
    },
    HOUR: {
        getDimensionType: () => DimensionType.TIMESTAMP,
    },
    DAY: {
        getDimensionType: () => DimensionType.DATE,
    },
    WEEK: {
        getDimensionType: () => DimensionType.DATE,
    },
    MONTH: {
        getDimensionType: () => DimensionType.DATE,
    },
    QUARTER: {
        getDimensionType: () => DimensionType.DATE,
    },
    YEAR: {
        getDimensionType: () => DimensionType.DATE,
    },
};

export const getDefaultTimeFrames = (type: DimensionType) =>
    type === DimensionType.TIMESTAMP
        ? [
              TimeFrames.RAW,
              TimeFrames.DAY,
              TimeFrames.WEEK,
              TimeFrames.MONTH,
              TimeFrames.YEAR,
          ]
        : [TimeFrames.DAY, TimeFrames.WEEK, TimeFrames.MONTH, TimeFrames.YEAR];

const isTimeInterval = (value: string): value is TimeFrames =>
    Object.keys(timeFrameConfigs).includes(value);

export const validateTimeFrames = (values: string[]): TimeFrames[] =>
    values.reduce<TimeFrames[]>((acc, value) => {
        const uppercaseValue = value.toUpperCase();
        return isTimeInterval(uppercaseValue) ? [...acc, uppercaseValue] : acc;
    }, []);
