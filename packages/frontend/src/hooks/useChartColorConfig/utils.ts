import { type EChartsSeries, type Series } from '@lightdash/common';
import { type SeriesLike } from './types';

/**
 * There's some variation in what Series object we may be working with.
 */

export const isGroupedSeries = (series: SeriesLike) => {
    return (
        (series as EChartsSeries)?.pivotReference?.pivotValues != null ||
        (series as Series)?.encode.yRef.pivotValues != null
    );
};

export const calculateSeriesLikeIdentifier = (series: SeriesLike) => {
    const baseField =
        (series as EChartsSeries).pivotReference?.field ??
        (series as Series).encode.yRef?.field;

    const pivotValues = (
        (series as EChartsSeries)?.pivotReference?.pivotValues ??
        (series as Series)?.encode.yRef.pivotValues ??
        []
    ).map(({ value }) => `${value}`);

    const pivotValuesSubPath =
        pivotValues && pivotValues.length > 0
            ? `${pivotValues.join('.')}`
            : null;

    /**
     * When dealing with flipped axis, Echarts will include the pivot value as
     * part of the field identifier - we want to remove it for the purposes of
     * color mapping if that's the case, so that we continue to have a mapping
     * that looks like:
     *
     *  basefield->pivot_value
     *
     * instead of:
     *
     *  basefield.pivot_value -> pivot_value
     *
     * (which would be a grouping of 1 per pivot value, causing all values to
     * be assigned the first color)
     */
    const baseFieldPathParts = baseField.split('.');

    const baseFieldPath =
        pivotValuesSubPath && baseFieldPathParts.at(-1) === pivotValuesSubPath
            ? baseFieldPathParts.slice(0, -1).join('.')
            : baseField;

    const completeIdentifier = pivotValuesSubPath
        ? pivotValuesSubPath
        : baseFieldPath;

    return [
        `${baseFieldPath}${
            /**
             * If we have more than one pivot value, we append the number of pivot values
             * to the group identifier, giving us a unique group per number of values.
             *
             * This is not critical, but gives us better serial color assignment when
             * switching between number of groups, since we're not tacking each group
             * configuration on top of eachother (under the same identifier).
             */
            pivotValues.length === 1 ? '' : `${`_n${pivotValues.length}`}`
        }`,
        completeIdentifier,
    ];
};
