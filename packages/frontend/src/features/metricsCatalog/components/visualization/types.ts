import type { MetricWithAssociatedTimeDimension } from '@lightdash/common';
import dayjs from 'dayjs';

export const DATE_FORMATS = {
    millisecond: (date: Date) => dayjs(date).format('HH:mm:ss.SSS'),
    second: (date: Date) => dayjs(date).format('HH:mm:ss'),
    minute: (date: Date) => dayjs(date).format('HH:mm'),
    hour: (date: Date) => dayjs(date).format('HH:mm'),
    day: (date: Date) => dayjs(date).format('MMM D'),
    week: (date: Date) => dayjs(date).format('MMM D'),
    month: (date: Date) => dayjs(date).format('MMM'),
    year: (date: Date) => dayjs(date).format('YYYY'),
};

export const COMPARISON_OPACITY = 0.3;

export type MetricVisualizationFormatConfig = {
    metric: MetricWithAssociatedTimeDimension | undefined;
    compareMetric: MetricWithAssociatedTimeDimension | null | undefined;
};
