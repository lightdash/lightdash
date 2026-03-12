import type { Explore } from '../types/explore';
import { DimensionType, type CompiledDimension } from '../types/field';
import type { MetricQuery } from '../types/metricQuery';
import { getItemId } from './item';
import { getDateDimension } from './timeFrames';

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

    const timeDimensionsMap: Record<string, CompiledDimension> = {};
    for (const dim of allDimensions) {
        if (
            dim.type === DimensionType.TIMESTAMP ||
            dim.type === DimensionType.DATE
        ) {
            timeDimensionsMap[getItemId(dim)] = dim;
        }
    }

    const dateDimensions = metricQuery.dimensions.filter(
        (d) => !!timeDimensionsMap[d],
    );

    let hasTimestampDimension = false;
    let hasDateDimension = false;
    const availableCustomGranularities: Record<string, string> = {};

    for (const dimId of dateDimensions) {
        const dim = timeDimensionsMap[dimId];
        const { baseDimensionId } = getDateDimension(dimId);
        const baseDim =
            dim.timeInterval && baseDimensionId
                ? (timeDimensionsMap[baseDimensionId] ?? dim)
                : dim;

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

    return {
        availableCustomGranularities,
        hasTimestampDimension,
        hasDateDimension,
    };
};
