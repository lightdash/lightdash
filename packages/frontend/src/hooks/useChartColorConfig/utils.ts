import { type EChartsSeries, type Series } from '@lightdash/common';
import { type SeriesLike } from './types';

/**
 * Simple string hash function (djb2 algorithm).
 * Returns a deterministic index for a given string.
 */
export const hashStringToIndex = (str: string, maxIndex: number): number => {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
        hash = (hash * 33) ^ str.charCodeAt(i);
    }
    return Math.abs(hash) % maxIndex;
};

/**
 * Calculates a unique identifier for a series, used for color assignment.
 * Returns [groupKey, identifier] tuple.
 */
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

    // Handle flipped axis edge case
    const baseFieldPathParts = baseField.split('.');

    const baseFieldPath =
        pivotValuesSubPath && baseFieldPathParts.at(-1) === pivotValuesSubPath
            ? baseFieldPathParts.slice(0, -1).join('.')
            : baseField;

    // For ungrouped series (no pivot), use field name as identifier
    // For grouped series, use the pivot value(s) as identifier
    const completeIdentifier = pivotValuesSubPath
        ? pivotValuesSubPath
        : baseFieldPath;

    // Ungrouped series share a common group so they get different colors.
    // Grouped series use field name as group, with suffix for multi-pivot.
    if (pivotValues.length === 0) {
        return ['$ungrouped', completeIdentifier];
    }

    const groupSuffix =
        pivotValues.length === 1 ? '' : `_n${pivotValues.length}`;
    return [`${baseFieldPath}${groupSuffix}`, completeIdentifier];
};
