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

/**
 * Collects all dimensions from an explore, keyed by item ID.
 */
export const getAllDimensionsMap = (
    explore: Explore,
): Record<string, CompiledDimension> => {
    const map: Record<string, CompiledDimension> = {};
    for (const table of Object.values(explore.tables)) {
        for (const dim of Object.values(table.dimensions)) {
            map[getItemId(dim)] = dim;
        }
    }
    return map;
};

/**
 * Resolves any dimension from the metric query to its base time dimension.
 * Handles three cases:
 * - Standard time-interval dims (e.g. order_date_month) → resolves via getDateDimension
 * - Custom granularity dims (e.g. order_date_fiscal_quarter) → resolves via timeIntervalBaseDimensionName
 * - Plain date/timestamp dims → returns the dimension itself
 */
export const resolveToBaseTimeDimension = (
    dimId: string,
    allDimensionsMap: Record<string, CompiledDimension>,
    timeDimensionsMap: Record<string, CompiledDimension>,
): CompiledDimension | undefined => {
    const dim = allDimensionsMap[dimId];
    if (!dim) return undefined;

    // Custom granularity or non-date time-interval dimension (e.g. QUARTER_NAME
    // is STRING-typed) — resolve via timeIntervalBaseDimensionName
    if (dim.timeIntervalBaseDimensionName) {
        return timeDimensionsMap[
            getItemId({
                table: dim.table,
                name: dim.timeIntervalBaseDimensionName,
            })
        ];
    }

    // Only process DATE/TIMESTAMP dimensions from here
    const timeDim = timeDimensionsMap[dimId];
    if (!timeDim) return undefined;

    return resolveBaseDimension(dimId, timeDim, timeDimensionsMap);
};

export const getDateZoomCapabilities = (
    explore: Explore,
    metricQuery: MetricQuery,
): DateZoomCapabilities => {
    const allDimensions = Object.values(explore.tables).flatMap((t) =>
        Object.values(t.dimensions),
    );

    const allDimensionsMap = getAllDimensionsMap(explore);
    const timeDimensionsMap = getTimeDimensionsMap(explore);

    let hasTimestampDimension = false;
    let hasDateDimension = false;

    // hasDateDimension / hasTimestampDimension reflect the chart's own usage
    // (used to gate sub-day standard granularities on DATE-only dashboards),
    // so they stay scoped to dims referenced by the chart's metricQuery.
    for (const dimId of metricQuery.dimensions) {
        const baseDim = resolveToBaseTimeDimension(
            dimId,
            allDimensionsMap,
            timeDimensionsMap,
        );

        if (baseDim) {
            if (baseDim.type === DimensionType.TIMESTAMP) {
                hasTimestampDimension = true;
            }
            if (baseDim.type === DimensionType.DATE) {
                hasDateDimension = true;
            }
        }
    }

    // Custom granularities are sourced from any `customTimeInterval` dim in
    // the explore, not just siblings of the chart's currently-queried base.
    // The previous chart-query intersection here stripped configured customs
    // whenever a dashboard tile's query didn't currently reference the owning
    // base dim — and was also timing-sensitive, since metricQuery loads
    // asynchronously alongside the explore (PROD-7514, regression of
    // PROD-6788).
    const availableCustomGranularities: Record<string, string> = {};
    for (const dim of allDimensions) {
        if (dim.customTimeInterval) {
            availableCustomGranularities[dim.customTimeInterval] = dim.label;
        }
    }

    return {
        availableCustomGranularities,
        hasTimestampDimension,
        hasDateDimension,
    };
};
