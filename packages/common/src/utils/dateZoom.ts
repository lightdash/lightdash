import type { Explore } from '../types/explore';
import { DimensionType, type CompiledDimension } from '../types/field';
import type { MetricQuery } from '../types/metricQuery';
import { getItemId } from './item';
import { getDateDimension } from './timeFrames';

/**
 * Collects all DATE and TIMESTAMP dimensions from an explore, keyed by item ID.
 */
export const getTimeDimensionsMap = (
    explore: Explore,
): Record<string, CompiledDimension> => {
    const map: Record<string, CompiledDimension> = {};
    for (const table of Object.values(explore.tables)) {
        for (const dim of Object.values(table.dimensions)) {
            if (
                dim.type === DimensionType.TIMESTAMP ||
                dim.type === DimensionType.DATE
            ) {
                map[getItemId(dim)] = dim;
            }
        }
    }
    return map;
};

/**
 * Resolves a time-interval dimension (e.g. `order_date_month`) to its base
 * dimension (e.g. `order_date`). If the dimension has no `timeInterval` or the
 * base can't be parsed from the ID, returns the dimension itself.
 *
 * When the base dimension ID is resolved but not found in the map, returns
 * `undefined` — callers should handle this as an unexpected state.
 */
export const resolveBaseDimension = (
    dimId: string,
    dim: CompiledDimension,
    timeDimensionsMap: Record<string, CompiledDimension>,
): CompiledDimension | undefined => {
    const { baseDimensionId } = getDateDimension(dimId);
    if (dim.timeInterval && baseDimensionId) {
        return timeDimensionsMap[baseDimensionId];
    }
    return dim;
};

export type DateZoomCapabilities = {
    availableCustomGranularities: Record<string, string>;
    hasTimestampDimension: boolean;
    hasDateDimension: boolean;
};

export const getDateZoomCapabilities = (
    explore: Explore,
    metricQuery: MetricQuery,
): DateZoomCapabilities => {
    const allDimensions = Object.values(explore.tables).flatMap((t) =>
        Object.values(t.dimensions),
    );

    const timeDimensionsMap = getTimeDimensionsMap(explore);

    const dateDimensions = metricQuery.dimensions.filter(
        (d) => !!timeDimensionsMap[d],
    );

    let hasTimestampDimension = false;
    let hasDateDimension = false;
    const availableCustomGranularities: Record<string, string> = {};

    for (const dimId of dateDimensions) {
        const dim = timeDimensionsMap[dimId];
        const baseDim = resolveBaseDimension(dimId, dim, timeDimensionsMap);

        if (baseDim) {
            if (baseDim.type === DimensionType.TIMESTAMP) {
                hasTimestampDimension = true;
            }
            if (baseDim.type === DimensionType.DATE) {
                hasDateDimension = true;
            }

            // Find sibling dimensions with customTimeInterval
            const baseName = baseDim.name;
            for (const sibling of allDimensions) {
                if (
                    sibling.customTimeInterval &&
                    sibling.timeIntervalBaseDimensionName === baseName
                ) {
                    availableCustomGranularities[sibling.customTimeInterval] =
                        sibling.label;
                }
            }
        }
    }

    return {
        availableCustomGranularities,
        hasTimestampDimension,
        hasDateDimension,
    };
};
