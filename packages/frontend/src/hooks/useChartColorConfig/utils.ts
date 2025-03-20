import { type Series } from '@lightdash/common';
import { type EChartSeries } from '../echarts/useEchartsCartesianConfig';
import { type SeriesLike } from './types';

/**
 * There's some variation in what Series object we may be working with.
 */

export const isGroupedSeries = (series: SeriesLike) => {
    return (
        (series as EChartSeries)?.pivotReference?.pivotValues != null ||
        (series as Series)?.encode.yRef.pivotValues != null
    );
};

export const calculateSeriesLikeIdentifier = (series: SeriesLike) => {
    const pivotValues = (
        (series as EChartSeries)?.pivotReference?.pivotValues ??
        (series as Series)?.encode.yRef.pivotValues ??
        []
    ).map(({ value }) => `${value}`);

    const pivotFields = (
        (series as EChartSeries)?.pivotReference?.pivotValues ??
        (series as Series)?.encode.yRef.pivotValues ??
        []
    ).map(({ field }) => `${field}`);

    return [pivotFields.join('.'), pivotValues.join('.')];
};
