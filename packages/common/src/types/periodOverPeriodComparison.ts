import { v4 as uuidv4 } from 'uuid';
import { getItemId } from '../utils/item';
import { timeFrameConfigs } from '../utils/timeFrames';
import { type Metric } from './field';
import { type AdditionalMetric } from './metricQuery';
import { TimeFrames } from './timeFrames';

type PreviousPeriod = {
    type: 'previousPeriod';
    granularity: TimeFrames; // TODO: improve this to only include DAY, WEEK, MONTH, QUARTER, YEAR
    periodOffset?: number; // e.g. compare this month to the last 3(periodOffset) months
};

export type PeriodOverPeriodComparison = PreviousPeriod & {
    // timeDimension
    field: {
        name: string;
        table: string;
    };
};

export const validPeriodOverPeriodGranularities = [
    TimeFrames.DAY,
    TimeFrames.WEEK,
    TimeFrames.MONTH,
    TimeFrames.QUARTER,
    TimeFrames.YEAR,
];

export const periodOverPeriodGranularityLabels: Record<TimeFrames, string> = {
    [TimeFrames.YEAR]: 'Year',
    [TimeFrames.QUARTER]: 'Quarter',
    [TimeFrames.MONTH]: 'Month',
    [TimeFrames.WEEK]: 'Week',
    [TimeFrames.DAY]: 'Day',
    [TimeFrames.HOUR]: 'Hour',
    [TimeFrames.MINUTE]: 'Minute',
    [TimeFrames.SECOND]: 'Second',
    [TimeFrames.MILLISECOND]: 'Millisecond',
    [TimeFrames.RAW]: 'Raw',
    [TimeFrames.DAY_OF_WEEK_INDEX]: 'Day of Week Index',
    [TimeFrames.DAY_OF_MONTH_NUM]: 'Day of Month',
    [TimeFrames.DAY_OF_YEAR_NUM]: 'Day of Year',
    [TimeFrames.WEEK_NUM]: 'Week Number',
    [TimeFrames.MONTH_NUM]: 'Month Number',
    [TimeFrames.QUARTER_NUM]: 'Quarter Number',
    [TimeFrames.YEAR_NUM]: 'Year Number',
    [TimeFrames.DAY_OF_WEEK_NAME]: 'Day of Week Name',
    [TimeFrames.MONTH_NAME]: 'Month Name',
    [TimeFrames.QUARTER_NAME]: 'Quarter Name',
    [TimeFrames.HOUR_OF_DAY_NUM]: 'Hour of Day',
    [TimeFrames.MINUTE_OF_HOUR_NUM]: 'Minute of Hour',
};

export const isSupportedPeriodOverPeriodGranularity = (
    granularity: TimeFrames,
) => validPeriodOverPeriodGranularities.includes(granularity);

export const buildPopAdditionalMetricName = (baseMetricName: string) =>
    `${baseMetricName}__pop`;

export const getPopPeriodLabel = (
    granularity: TimeFrames,
    periodOffset: number,
) => {
    const label = timeFrameConfigs[granularity]?.getLabel() || granularity;
    return periodOffset === 1
        ? `Previous ${String(label).toLowerCase()}`
        : `${periodOffset} ${String(label).toLowerCase()}s ago`;
};

export const buildPopAdditionalMetric = ({
    metric,
    timeDimensionId,
    granularity,
    periodOffset,
}: {
    metric: Pick<
        Metric,
        | 'table'
        | 'name'
        | 'label'
        | 'description'
        | 'type'
        | 'sql'
        | 'round'
        | 'compact'
        | 'format'
    >;
    timeDimensionId: string;
    granularity: TimeFrames;
    periodOffset: number;
}): { additionalMetric: AdditionalMetric; metricId: string } => {
    const baseMetricId = getItemId(metric);
    const popName = buildPopAdditionalMetricName(metric.name);
    const popMetricId = getItemId({ table: metric.table, name: popName });

    const additionalMetric: AdditionalMetric = {
        uuid: uuidv4(),
        table: metric.table,
        name: popName,
        label: `${metric.label} (${getPopPeriodLabel(
            granularity,
            periodOffset,
        )})`,
        description: metric.description,
        type: metric.type,
        sql: metric.sql,
        hidden: true,
        round: metric.round,
        compact: metric.compact,
        format: metric.format,
        generationType: 'periodOverPeriod',
        baseMetricId,
        timeDimensionId,
        granularity,
        periodOffset,
    };

    return { additionalMetric, metricId: popMetricId };
};

// Granularity order from finest to coarsest (lower index = finer)
const GRANULARITY_ORDER: TimeFrames[] = [
    TimeFrames.DAY,
    TimeFrames.WEEK,
    TimeFrames.MONTH,
    TimeFrames.QUARTER,
    TimeFrames.YEAR,
];

export const getGranularityRank = (granularity: TimeFrames): number => {
    const index = GRANULARITY_ORDER.indexOf(granularity);
    return index === -1 ? Infinity : index;
};
