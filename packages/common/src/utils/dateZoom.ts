import { type DateZoom } from '../types/api/paginatedQuery';
import {
    type DashboardConfig,
    type DateZoomConfig,
    type DateZoomControl,
} from '../types/dashboard';
import type { Explore } from '../types/explore';
import { DimensionType, type CompiledDimension } from '../types/field';
import type { MetricQuery } from '../types/metricQuery';
import { isCartesianChartConfig, type ChartConfig } from '../types/savedCharts';
import { DateGranularity } from '../types/timeFrames';
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

/**
 * Resolves which field a chart's date zoom should target. For cartesian charts
 * whose x-axis resolves to a time dimension, that's the x-axis field — so
 * callers can pass it as `dateZoom.xAxisFieldId` and have the backend re-grain
 * the same field the chart actually plots, instead of auto-picking the first
 * date dimension in the query. Uses the same `resolveToBaseTimeDimension` check
 * the backend applies, so custom/string-typed interval x-axes (e.g. a
 * fiscal-quarter dimension) are targeted too. Returns undefined when the
 * backend's auto-pick should stand (non-cartesian charts, non-time x-axis, or
 * no x-axis).
 */
export const getDateZoomXAxisFieldId = (
    chartConfig: ChartConfig,
    explore: Explore | undefined,
): string | undefined => {
    if (!explore || !isCartesianChartConfig(chartConfig.config)) {
        return undefined;
    }
    const xFieldId = chartConfig.config.layout?.xField;
    if (!xFieldId) {
        return undefined;
    }
    const baseTimeDimension = resolveToBaseTimeDimension(
        xFieldId,
        getAllDimensionsMap(explore),
        getTimeDimensionsMap(explore),
    );
    return baseTimeDimension ? xFieldId : undefined;
};

export type ChartZoomableField = {
    fieldId: string;
    label: string;
    tableName: string;
};

/**
 * The date fields a chart can actually be zoomed on: the dimensions in the
 * chart's own `metricQuery` that resolve to a base DATE/TIMESTAMP dimension.
 * This is the set a date-zoom control should offer for a tile, narrower than
 * the dashboard-filter field set, which exposes every filterable dimension in
 * the explore regardless of whether the chart plots it.
 *
 * The returned `fieldId` is the queried dimension id (e.g. `orders_order_date_month`),
 * matching the `xAxisFieldId` the backend re-grains in `_getDateZoomExplore`.
 */
export const getChartZoomableFields = (
    explore: Explore,
    metricQuery: MetricQuery,
): ChartZoomableField[] => {
    const allDimensionsMap = getAllDimensionsMap(explore);
    const timeDimensionsMap = getTimeDimensionsMap(explore);
    const fields: ChartZoomableField[] = [];
    const seen = new Set<string>();
    [...new Set(metricQuery.dimensions)].forEach((dimId) => {
        const dim = allDimensionsMap[dimId];
        if (!dim || seen.has(dimId)) return;
        const baseTimeDimension = resolveToBaseTimeDimension(
            dimId,
            allDimensionsMap,
            timeDimensionsMap,
        );
        if (!baseTimeDimension) return;
        seen.add(dimId);
        fields.push({
            fieldId: dimId,
            label: dim.label ?? dimId,
            tableName: dim.table,
        });
    });
    return fields;
};

export const EMPTY_DATE_ZOOM_CONFIG: DateZoomConfig = {
    controls: [],
    tileTargets: {},
};

export const normalizeDateZoomConfig = (
    config: DashboardConfig | undefined,
): DateZoomConfig => config?.dateZoomConfig ?? EMPTY_DATE_ZOOM_CONFIG;

export const isEmptyDateZoomConfig = (config: DateZoomConfig): boolean =>
    config.controls.length === 0;

export const getTileControl = (
    config: DateZoomConfig,
    tileUuid: string,
): DateZoomControl | undefined => {
    const target = config.tileTargets[tileUuid];
    return target
        ? config.controls.find((control) => control.uuid === target.controlUuid)
        : undefined;
};

export const getControlActiveGranularity = (
    control: DateZoomControl,
    runtimeGranularities: Record<string, DateGranularity | string>,
): DateGranularity | string =>
    runtimeGranularities[control.uuid] ?? control.granularity;

export type ResolveTileDateZoomArgs = {
    config: DateZoomConfig;
    tileUuid: string;
    runtimeGranularities: Record<string, DateGranularity | string>;
    globalGranularity: DateGranularity | string | undefined;
    defaultXAxisFieldId: string | undefined;
};

export const resolveTileDateZoom = ({
    config,
    tileUuid,
    runtimeGranularities,
    globalGranularity,
    defaultXAxisFieldId,
}: ResolveTileDateZoomArgs): DateZoom | undefined => {
    const target = config.tileTargets[tileUuid];
    const control = target
        ? config.controls.find((c) => c.uuid === target.controlUuid)
        : undefined;

    if (target && control) {
        const granularity = getControlActiveGranularity(
            control,
            runtimeGranularities,
        );
        // Param-only targets have no field to re-grain (fieldId null); the grain
        // only feeds the reserved `date_zoom` parameter.
        return {
            granularity,
            ...(target.fieldId ? { xAxisFieldId: target.fieldId } : {}),
        };
    }

    // Unassigned (or dangling target) -> Default = today's behavior.
    if (globalGranularity === undefined) {
        return undefined;
    }
    return {
        granularity: globalGranularity,
        ...(defaultXAxisFieldId ? { xAxisFieldId: defaultXAxisFieldId } : {}),
    };
};

// Match the existing global `?dateZoom` read: a standard grain round-trips to
// its canonical `DateGranularity` case; a custom-interval value is kept as-is.
export const normalizeGranularityParam = (
    param: string,
): DateGranularity | string =>
    Object.values(DateGranularity).find(
        (grain) => grain.toLowerCase() === param.toLowerCase(),
    ) ?? param;

export const copyDateZoomTileTargets = (
    config: DateZoomConfig,
    mapping: Array<{ fromTileUuid: string; toTileUuid: string }>,
): DateZoomConfig => {
    const tileTargets = { ...config.tileTargets };
    let changed = false;
    mapping.forEach(({ fromTileUuid, toTileUuid }) => {
        const source = config.tileTargets[fromTileUuid];
        if (source) {
            tileTargets[toTileUuid] = { ...source };
            changed = true;
        }
    });
    return changed ? { ...config, tileTargets } : config;
};

export const pruneDateZoomConfig = (config: DateZoomConfig): DateZoomConfig => {
    const validControlUuids = new Set(config.controls.map((c) => c.uuid));
    const liveTargets = Object.entries(config.tileTargets).filter(
        ([, target]) => validControlUuids.has(target.controlUuid),
    );
    const referenced = new Set(
        liveTargets.map(([, target]) => target.controlUuid),
    );
    return {
        controls: config.controls.filter((c) => referenced.has(c.uuid)),
        tileTargets: Object.fromEntries(liveTargets),
    };
};

/**
 * Drops the date-zoom targets for the given tiles (e.g. tiles deleted from the
 * dashboard) and prunes any control left with no targets. Returns the same
 * reference when none of the tiles had a target, so callers can skip a no-op
 * config update on dashboards that don't use controls.
 */
export const removeDateZoomTileTargets = (
    config: DateZoomConfig,
    tileUuids: string[],
): DateZoomConfig => {
    const removed = new Set(tileUuids);
    if (![...removed].some((uuid) => config.tileTargets[uuid])) {
        return config;
    }
    return pruneDateZoomConfig({
        ...config,
        tileTargets: Object.fromEntries(
            Object.entries(config.tileTargets).filter(
                ([uuid]) => !removed.has(uuid),
            ),
        ),
    });
};
