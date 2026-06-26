import type { DateZoomConfig, DateZoomControl } from '../types/dashboard';
import type { Explore } from '../types/explore';
import { ExploreType } from '../types/explore';
import { DimensionType, FieldType } from '../types/field';
import type { CompiledDimension } from '../types/field';
import type { MetricQuery } from '../types/metricQuery';
import { ChartType, type ChartConfig } from '../types/savedCharts';
import { DateGranularity } from '../types/timeFrames';
import {
    copyDateZoomTileTargets,
    EMPTY_DATE_ZOOM_CONFIG,
    getChartZoomableFields,
    getControlActiveGranularity,
    getDateZoomCapabilities,
    getDateZoomXAxisFieldId,
    getTileControl,
    getTimeDimensionsMap,
    isEmptyDateZoomConfig,
    normalizeDateZoomConfig,
    normalizeGranularityParam,
    pruneDateZoomConfig,
    removeDateZoomTileTargets,
    resolveBaseDimension,
    resolveTileDateZoom,
} from './dateZoom';

const makeDimension = (
    overrides: Partial<CompiledDimension> & {
        name: string;
        table: string;
        type: DimensionType;
    },
): CompiledDimension =>
    ({
        fieldType: FieldType.DIMENSION,
        label: overrides.name,
        tableLabel: overrides.table,
        sql: `\${TABLE}.${overrides.name}`,
        hidden: false,
        compiledSql: `"${overrides.table}".${overrides.name}`,
        tablesReferences: [overrides.table],
        ...overrides,
    }) as CompiledDimension;

const makeExplore = (
    dimensions: CompiledDimension[],
    tableName = 'orders',
): Explore => {
    const dimMap: Record<string, CompiledDimension> = {};
    for (const dim of dimensions) {
        dimMap[dim.name] = dim;
    }
    return {
        name: tableName,
        label: tableName,
        tags: [],
        baseTable: tableName,
        joinedTables: [],
        tables: {
            [tableName]: {
                name: tableName,
                label: tableName,
                database: 'test_db',
                schema: 'public',
                sqlTable: `"public"."${tableName}"`,
                dimensions: dimMap,
                metrics: {},
                lineageGraph: {},
            },
        },
        targetDatabase: 'postgres' as Explore['targetDatabase'],
        type: ExploreType.DEFAULT,
    } as Explore;
};

const makeMetricQuery = (dimensions: string[]): MetricQuery =>
    ({
        exploreName: 'orders',
        dimensions,
        metrics: [],
        filters: { dimensions: undefined, metrics: undefined },
        sorts: [],
        limit: 500,
        tableCalculations: [],
    }) as unknown as MetricQuery;

describe('getTimeDimensionsMap', () => {
    it('returns only DATE and TIMESTAMP dimensions keyed by item ID', () => {
        const dateDim = makeDimension({
            name: 'order_date',
            table: 'orders',
            type: DimensionType.DATE,
        });
        const timestampDim = makeDimension({
            name: 'created_at',
            table: 'orders',
            type: DimensionType.TIMESTAMP,
        });
        const stringDim = makeDimension({
            name: 'status',
            table: 'orders',
            type: DimensionType.STRING,
        });
        const numberDim = makeDimension({
            name: 'amount',
            table: 'orders',
            type: DimensionType.NUMBER,
        });
        const explore = makeExplore([
            dateDim,
            timestampDim,
            stringDim,
            numberDim,
        ]);

        const result = getTimeDimensionsMap(explore);

        expect(Object.keys(result)).toEqual([
            'orders_order_date',
            'orders_created_at',
        ]);
        expect(result.orders_order_date).toBe(dateDim);
        expect(result.orders_created_at).toBe(timestampDim);
    });

    it('returns an empty map when explore has no date/timestamp dimensions', () => {
        const stringDim = makeDimension({
            name: 'status',
            table: 'orders',
            type: DimensionType.STRING,
        });
        const explore = makeExplore([stringDim]);

        const result = getTimeDimensionsMap(explore);

        expect(result).toEqual({});
    });

    it('includes dimensions from multiple tables', () => {
        const orderDate = makeDimension({
            name: 'order_date',
            table: 'orders',
            type: DimensionType.DATE,
        });
        const userCreatedAt = makeDimension({
            name: 'created_at',
            table: 'users',
            type: DimensionType.TIMESTAMP,
        });

        const explore: Explore = {
            name: 'orders',
            label: 'orders',
            tags: [],
            baseTable: 'orders',
            joinedTables: [],
            tables: {
                orders: {
                    name: 'orders',
                    label: 'orders',
                    database: 'test_db',
                    schema: 'public',
                    sqlTable: '"public"."orders"',
                    dimensions: { order_date: orderDate },
                    metrics: {},
                    lineageGraph: {},
                },
                users: {
                    name: 'users',
                    label: 'users',
                    database: 'test_db',
                    schema: 'public',
                    sqlTable: '"public"."users"',
                    dimensions: { created_at: userCreatedAt },
                    metrics: {},
                    lineageGraph: {},
                },
            },
            targetDatabase: 'postgres' as Explore['targetDatabase'],
            type: ExploreType.DEFAULT,
        } as Explore;

        const result = getTimeDimensionsMap(explore);

        expect(Object.keys(result).sort()).toEqual([
            'orders_order_date',
            'users_created_at',
        ]);
    });
});

describe('resolveBaseDimension', () => {
    it('returns the dimension itself when it has no timeInterval', () => {
        const dim = makeDimension({
            name: 'order_date',
            table: 'orders',
            type: DimensionType.DATE,
        });
        const timeDimensionsMap = { orders_order_date: dim };

        const result = resolveBaseDimension(
            'orders_order_date',
            dim,
            timeDimensionsMap,
        );

        expect(result).toBe(dim);
    });

    it('resolves to the base dimension when timeInterval is set and base exists', () => {
        const baseDim = makeDimension({
            name: 'created_at',
            table: 'orders',
            type: DimensionType.TIMESTAMP,
        });
        const monthDim = makeDimension({
            name: 'created_at_month',
            table: 'orders',
            type: DimensionType.DATE,
            timeInterval: 'MONTH' as CompiledDimension['timeInterval'],
            timeIntervalBaseDimensionName: 'created_at',
        });
        const timeDimensionsMap = {
            orders_created_at: baseDim,
            orders_created_at_month: monthDim,
        };

        const result = resolveBaseDimension(
            'orders_created_at_month',
            monthDim,
            timeDimensionsMap,
        );

        expect(result).toBe(baseDim);
    });

    it('returns undefined when base dimension is not in the map', () => {
        const monthDim = makeDimension({
            name: 'created_at_month',
            table: 'orders',
            type: DimensionType.DATE,
            timeInterval: 'MONTH' as CompiledDimension['timeInterval'],
            timeIntervalBaseDimensionName: 'created_at',
        });
        const timeDimensionsMap = {
            orders_created_at_month: monthDim,
        };

        const result = resolveBaseDimension(
            'orders_created_at_month',
            monthDim,
            timeDimensionsMap,
        );

        expect(result).toBeUndefined();
    });

    it('returns the dimension itself when baseDimensionId cannot be parsed', () => {
        // A dimension with timeInterval set but whose name doesn't end in a
        // recognized time frame suffix — getDateDimension returns no baseDimensionId
        const dim = makeDimension({
            name: 'custom_field',
            table: 'orders',
            type: DimensionType.DATE,
            timeInterval: 'MONTH' as CompiledDimension['timeInterval'],
        });
        const timeDimensionsMap = { orders_custom_field: dim };

        const result = resolveBaseDimension(
            'orders_custom_field',
            dim,
            timeDimensionsMap,
        );

        expect(result).toBe(dim);
    });
});

const controlConfig = (
    overrides?: Partial<DateZoomControl>,
): DateZoomConfig => ({
    controls: [
        {
            uuid: 'ctrl-1',
            name: 'Revenue zoom',
            granularity: DateGranularity.MONTH,
            ...overrides,
        },
    ],
    tileTargets: {
        tileA: {
            controlUuid: 'ctrl-1',
            fieldId: 'orders_fiscal_date',
            tableName: 'orders',
        },
    },
});

describe('normalizeDateZoomConfig', () => {
    it('returns the empty config when dashboard config is undefined', () => {
        expect(normalizeDateZoomConfig(undefined)).toEqual(
            EMPTY_DATE_ZOOM_CONFIG,
        );
    });

    it('returns the empty config when dateZoomConfig is absent', () => {
        expect(normalizeDateZoomConfig({ isDateZoomDisabled: false })).toEqual(
            EMPTY_DATE_ZOOM_CONFIG,
        );
    });

    it('passes through an existing dateZoomConfig', () => {
        const cfg = controlConfig();
        expect(
            normalizeDateZoomConfig({
                isDateZoomDisabled: false,
                dateZoomConfig: cfg,
            }),
        ).toBe(cfg);
    });
});

describe('isEmptyDateZoomConfig', () => {
    it('is true when there are no controls', () => {
        expect(isEmptyDateZoomConfig(EMPTY_DATE_ZOOM_CONFIG)).toBe(true);
    });

    it('is false when a control exists', () => {
        expect(isEmptyDateZoomConfig(controlConfig())).toBe(false);
    });
});

describe('getTileControl', () => {
    it('finds the control a tile is attached to', () => {
        expect(getTileControl(controlConfig(), 'tileA')?.uuid).toBe('ctrl-1');
    });

    it('returns undefined for an unassigned tile', () => {
        expect(getTileControl(controlConfig(), 'tileZ')).toBeUndefined();
    });

    it('returns undefined for a dangling controlUuid', () => {
        const cfg: DateZoomConfig = {
            controls: [],
            tileTargets: {
                tileA: {
                    controlUuid: 'ctrl-gone',
                    fieldId: 'f',
                    tableName: 't',
                },
            },
        };
        expect(getTileControl(cfg, 'tileA')).toBeUndefined();
    });
});

describe('getControlActiveGranularity', () => {
    const control = controlConfig().controls[0];

    it('uses the persisted granularity when no runtime override exists', () => {
        expect(getControlActiveGranularity(control, {})).toBe(
            DateGranularity.MONTH,
        );
    });

    it('prefers a runtime override', () => {
        expect(
            getControlActiveGranularity(control, {
                'ctrl-1': DateGranularity.WEEK,
            }),
        ).toBe(DateGranularity.WEEK);
    });
});

describe('resolveTileDateZoom', () => {
    const base = {
        config: controlConfig(),
        runtimeGranularities: {},
        globalGranularity: DateGranularity.YEAR as
            | DateGranularity
            | string
            | undefined,
        defaultXAxisFieldId: 'orders_order_date_year' as string | undefined,
    };

    it('zooms an attached tile on its field at the control grain', () => {
        expect(resolveTileDateZoom({ ...base, tileUuid: 'tileA' })).toEqual({
            granularity: DateGranularity.MONTH,
            xAxisFieldId: 'orders_fiscal_date',
        });
    });

    it('applies a runtime control-grain override', () => {
        expect(
            resolveTileDateZoom({
                ...base,
                tileUuid: 'tileA',
                runtimeGranularities: { 'ctrl-1': DateGranularity.WEEK },
            }),
        ).toEqual({
            granularity: DateGranularity.WEEK,
            xAxisFieldId: 'orders_fiscal_date',
        });
    });

    it('falls through to the Default for an unassigned tile (preserves x-axis baseline)', () => {
        expect(resolveTileDateZoom({ ...base, tileUuid: 'tileZ' })).toEqual({
            granularity: DateGranularity.YEAR,
            xAxisFieldId: 'orders_order_date_year',
        });
    });

    it('falls through to the Default for a dangling target', () => {
        const cfg: DateZoomConfig = {
            controls: [],
            tileTargets: {
                tileA: {
                    controlUuid: 'ctrl-gone',
                    fieldId: 'f',
                    tableName: 't',
                },
            },
        };
        expect(
            resolveTileDateZoom({ ...base, config: cfg, tileUuid: 'tileA' }),
        ).toEqual({
            granularity: DateGranularity.YEAR,
            xAxisFieldId: 'orders_order_date_year',
        });
    });

    it('returns undefined for an unassigned tile when the Default grain is unset', () => {
        expect(
            resolveTileDateZoom({
                ...base,
                tileUuid: 'tileZ',
                globalGranularity: undefined,
            }),
        ).toBeUndefined();
    });

    it('returns grain-only for an unassigned tile with no x-axis target', () => {
        expect(
            resolveTileDateZoom({
                ...base,
                tileUuid: 'tileZ',
                defaultXAxisFieldId: undefined,
            }),
        ).toEqual({ granularity: DateGranularity.YEAR });
    });
});

// Locks the backwards-compatibility contract the config read path relies on:
// with no config (existing dashboards), every tile resolves to the single
// global date-zoom setting exactly as it did before configs existed.
describe('resolveTileDateZoom — legacy single-setting backwards compatibility', () => {
    const legacyBase = {
        config: EMPTY_DATE_ZOOM_CONFIG,
        runtimeGranularities: {},
        defaultXAxisFieldId: 'orders_order_date_year' as string | undefined,
    };

    it('applies the global granularity to every tile on its x-axis baseline', () => {
        const expected = {
            granularity: DateGranularity.YEAR,
            xAxisFieldId: 'orders_order_date_year',
        };
        // No per-tile config exists, so the result is identical across tiles.
        expect(
            resolveTileDateZoom({
                ...legacyBase,
                tileUuid: 'tile-1',
                globalGranularity: DateGranularity.YEAR,
            }),
        ).toEqual(expected);
        expect(
            resolveTileDateZoom({
                ...legacyBase,
                tileUuid: 'tile-2',
                globalGranularity: DateGranularity.YEAR,
            }),
        ).toEqual(expected);
    });

    it('applies no zoom when the global setting is unset (chart keeps its own grain)', () => {
        expect(
            resolveTileDateZoom({
                ...legacyBase,
                tileUuid: 'tile-1',
                globalGranularity: undefined,
            }),
        ).toBeUndefined();
    });

    it('zooms grain-only for a tile with no date x-axis field', () => {
        expect(
            resolveTileDateZoom({
                ...legacyBase,
                tileUuid: 'tile-1',
                globalGranularity: DateGranularity.WEEK,
                defaultXAxisFieldId: undefined,
            }),
        ).toEqual({ granularity: DateGranularity.WEEK });
    });

    it('flag-off swap makes saved controls inert: a would-be-attached tile falls back to the global setting', () => {
        // useDashboardChartReadyQuery substitutes EMPTY_DATE_ZOOM_CONFIG when the
        // flag is off, so 'tileA' (attached to ctrl-1 under controlConfig()) and
        // its runtime override are ignored, resolving to the legacy global grain.
        expect(
            resolveTileDateZoom({
                ...legacyBase,
                tileUuid: 'tileA',
                globalGranularity: DateGranularity.MONTH,
                runtimeGranularities: { 'ctrl-1': DateGranularity.DAY },
            }),
        ).toEqual({
            granularity: DateGranularity.MONTH,
            xAxisFieldId: 'orders_order_date_year',
        });
    });
});

describe('normalizeGranularityParam', () => {
    it('normalizes a lowercased standard grain to canonical case', () => {
        expect(normalizeGranularityParam('week')).toBe(DateGranularity.WEEK);
    });

    it('passes through a non-standard (custom interval) value as-is', () => {
        expect(normalizeGranularityParam('orders_custom_period')).toBe(
            'orders_custom_period',
        );
    });
});

describe('lifecycle helpers', () => {
    it('copies a tile target to a duplicated tile, inheriting control + field', () => {
        const next = copyDateZoomTileTargets(controlConfig(), [
            { fromTileUuid: 'tileA', toTileUuid: 'tileA-copy' },
        ]);
        expect(next.tileTargets['tileA-copy']).toEqual({
            controlUuid: 'ctrl-1',
            fieldId: 'orders_fiscal_date',
            tableName: 'orders',
        });
    });

    it('returns the same config when the source tile is unassigned', () => {
        const cfg = controlConfig();
        expect(
            copyDateZoomTileTargets(cfg, [
                { fromTileUuid: 'tileZ', toTileUuid: 'tileZ-copy' },
            ]),
        ).toBe(cfg);
    });

    it('prunes controls that have no targets', () => {
        const emptied: DateZoomConfig = {
            controls: controlConfig().controls,
            tileTargets: {},
        };
        expect(pruneDateZoomConfig(emptied)).toEqual(EMPTY_DATE_ZOOM_CONFIG);
    });

    it('prunes targets whose control was removed (dangling)', () => {
        const cfg: DateZoomConfig = {
            controls: [],
            tileTargets: {
                tileA: {
                    controlUuid: 'ctrl-gone',
                    fieldId: 'f',
                    tableName: 't',
                },
            },
        };
        expect(pruneDateZoomConfig(cfg)).toEqual(EMPTY_DATE_ZOOM_CONFIG);
    });

    it('removes a deleted tile and prunes the now-empty control', () => {
        // tileA is the control's only target -> deleting it drops the control.
        expect(removeDateZoomTileTargets(controlConfig(), ['tileA'])).toEqual(
            EMPTY_DATE_ZOOM_CONFIG,
        );
    });

    it('removes a deleted tile but keeps a control with surviving targets', () => {
        const cfg: DateZoomConfig = {
            controls: controlConfig().controls,
            tileTargets: {
                tileA: {
                    controlUuid: 'ctrl-1',
                    fieldId: 'orders_fiscal_date',
                    tableName: 'orders',
                },
                tileB: {
                    controlUuid: 'ctrl-1',
                    fieldId: 'orders_fiscal_date',
                    tableName: 'orders',
                },
            },
        };
        const next = removeDateZoomTileTargets(cfg, ['tileA']);
        expect(next.controls).toHaveLength(1);
        expect(Object.keys(next.tileTargets)).toEqual(['tileB']);
    });

    it('returns the same config when no deleted tile had a target', () => {
        const cfg = controlConfig();
        expect(removeDateZoomTileTargets(cfg, ['tileZ'])).toBe(cfg);
    });
});

describe('getDateZoomCapabilities', () => {
    it('returns empty capabilities when no date dimensions exist in explore', () => {
        const dim = makeDimension({
            name: 'status',
            table: 'orders',
            type: DimensionType.STRING,
        });
        const explore = makeExplore([dim]);
        const metricQuery = makeMetricQuery(['orders_status']);

        const result = getDateZoomCapabilities(explore, metricQuery);

        expect(result).toEqual({
            availableCustomGranularities: {},
            hasTimestampDimension: false,
            hasDateDimension: false,
        });
    });

    it('returns empty capabilities when metric query has no dimensions', () => {
        const dim = makeDimension({
            name: 'order_date',
            table: 'orders',
            type: DimensionType.DATE,
        });
        const explore = makeExplore([dim]);
        const metricQuery = makeMetricQuery([]);

        const result = getDateZoomCapabilities(explore, metricQuery);

        expect(result).toEqual({
            availableCustomGranularities: {},
            hasTimestampDimension: false,
            hasDateDimension: false,
        });
    });

    it('detects a DATE dimension', () => {
        const dim = makeDimension({
            name: 'order_date',
            table: 'orders',
            type: DimensionType.DATE,
        });
        const explore = makeExplore([dim]);
        const metricQuery = makeMetricQuery(['orders_order_date']);

        const result = getDateZoomCapabilities(explore, metricQuery);

        expect(result.hasDateDimension).toBe(true);
        expect(result.hasTimestampDimension).toBe(false);
    });

    it('detects a TIMESTAMP dimension', () => {
        const dim = makeDimension({
            name: 'created_at',
            table: 'orders',
            type: DimensionType.TIMESTAMP,
        });
        const explore = makeExplore([dim]);
        const metricQuery = makeMetricQuery(['orders_created_at']);

        const result = getDateZoomCapabilities(explore, metricQuery);

        expect(result.hasTimestampDimension).toBe(true);
        expect(result.hasDateDimension).toBe(false);
    });

    it('resolves time-interval dimension to its base dimension type', () => {
        const baseDim = makeDimension({
            name: 'created_at',
            table: 'orders',
            type: DimensionType.TIMESTAMP,
            isIntervalBase: true,
        });
        const monthDim = makeDimension({
            name: 'created_at_month',
            table: 'orders',
            type: DimensionType.DATE,
            timeInterval: 'MONTH' as CompiledDimension['timeInterval'],
            timeIntervalBaseDimensionName: 'created_at',
        });
        const explore = makeExplore([baseDim, monthDim]);
        // The metric query uses the month-derived dimension
        const metricQuery = makeMetricQuery(['orders_created_at_month']);

        const result = getDateZoomCapabilities(explore, metricQuery);

        // Should resolve to the base dimension's type (TIMESTAMP), not the derived DATE
        expect(result.hasTimestampDimension).toBe(true);
        expect(result.hasDateDimension).toBe(false);
    });

    it('skips dimension when base dimension is not found in explore', () => {
        // Simulates a case where the base dimension is missing from the explore
        const monthDim = makeDimension({
            name: 'created_at_month',
            table: 'orders',
            type: DimensionType.DATE,
            timeInterval: 'MONTH' as CompiledDimension['timeInterval'],
            timeIntervalBaseDimensionName: 'created_at',
        });
        const explore = makeExplore([monthDim]);
        const metricQuery = makeMetricQuery(['orders_created_at_month']);

        const result = getDateZoomCapabilities(explore, metricQuery);

        // Base dimension missing — dimension is skipped, no capabilities detected
        expect(result.hasDateDimension).toBe(false);
        expect(result.hasTimestampDimension).toBe(false);
    });

    it('collects available custom granularities from sibling dimensions', () => {
        const baseDim = makeDimension({
            name: 'order_date',
            table: 'orders',
            type: DimensionType.DATE,
            isIntervalBase: true,
        });
        const customFiscalQuarter = makeDimension({
            name: 'order_date_fiscal_quarter',
            table: 'orders',
            type: DimensionType.STRING,
            customTimeInterval: 'fiscal_quarter',
            timeIntervalBaseDimensionName: 'order_date',
            label: 'Fiscal Quarter',
        });
        const customFiscalYear = makeDimension({
            name: 'order_date_fiscal_year',
            table: 'orders',
            type: DimensionType.STRING,
            customTimeInterval: 'fiscal_year',
            timeIntervalBaseDimensionName: 'order_date',
            label: 'Fiscal Year',
        });
        const explore = makeExplore([
            baseDim,
            customFiscalQuarter,
            customFiscalYear,
        ]);
        const metricQuery = makeMetricQuery(['orders_order_date']);

        const result = getDateZoomCapabilities(explore, metricQuery);

        expect(result.availableCustomGranularities).toEqual({
            fiscal_quarter: 'Fiscal Quarter',
            fiscal_year: 'Fiscal Year',
        });
    });

    it('collects custom granularities when querying a derived time-interval dimension', () => {
        const baseDim = makeDimension({
            name: 'order_date',
            table: 'orders',
            type: DimensionType.DATE,
            isIntervalBase: true,
        });
        const monthDim = makeDimension({
            name: 'order_date_month',
            table: 'orders',
            type: DimensionType.DATE,
            timeInterval: 'MONTH' as CompiledDimension['timeInterval'],
            timeIntervalBaseDimensionName: 'order_date',
        });
        const customFiscalQuarter = makeDimension({
            name: 'order_date_fiscal_quarter',
            table: 'orders',
            type: DimensionType.STRING,
            customTimeInterval: 'fiscal_quarter',
            timeIntervalBaseDimensionName: 'order_date',
            label: 'Fiscal Quarter',
        });
        const explore = makeExplore([baseDim, monthDim, customFiscalQuarter]);
        // Query uses the month dimension, should still find custom granularities via the base
        const metricQuery = makeMetricQuery(['orders_order_date_month']);

        const result = getDateZoomCapabilities(explore, metricQuery);

        expect(result.availableCustomGranularities).toEqual({
            fiscal_quarter: 'Fiscal Quarter',
        });
    });

    it('handles multiple date dimensions across different types', () => {
        const dateDim = makeDimension({
            name: 'order_date',
            table: 'orders',
            type: DimensionType.DATE,
        });
        const timestampDim = makeDimension({
            name: 'created_at',
            table: 'orders',
            type: DimensionType.TIMESTAMP,
        });
        const explore = makeExplore([dateDim, timestampDim]);
        const metricQuery = makeMetricQuery([
            'orders_order_date',
            'orders_created_at',
        ]);

        const result = getDateZoomCapabilities(explore, metricQuery);

        expect(result.hasDateDimension).toBe(true);
        expect(result.hasTimestampDimension).toBe(true);
    });

    it('ignores dimensions in the metric query that are not date/timestamp', () => {
        const dateDim = makeDimension({
            name: 'order_date',
            table: 'orders',
            type: DimensionType.DATE,
        });
        const stringDim = makeDimension({
            name: 'status',
            table: 'orders',
            type: DimensionType.STRING,
        });
        const explore = makeExplore([dateDim, stringDim]);
        const metricQuery = makeMetricQuery([
            'orders_order_date',
            'orders_status',
        ]);

        const result = getDateZoomCapabilities(explore, metricQuery);

        expect(result.hasDateDimension).toBe(true);
        expect(result.hasTimestampDimension).toBe(false);
    });

    it('collects custom granularities when the metric query uses a STRING-typed custom granularity dimension', () => {
        const baseDim = makeDimension({
            name: 'order_date',
            table: 'orders',
            type: DimensionType.DATE,
            isIntervalBase: true,
        });
        const customFiscalQuarter = makeDimension({
            name: 'order_date_fiscal_quarter',
            table: 'orders',
            type: DimensionType.STRING,
            customTimeInterval: 'fiscal_quarter',
            timeIntervalBaseDimensionName: 'order_date',
            label: 'Fiscal Quarter',
        });
        const customFiscalYear = makeDimension({
            name: 'order_date_fiscal_year',
            table: 'orders',
            type: DimensionType.STRING,
            customTimeInterval: 'fiscal_year',
            timeIntervalBaseDimensionName: 'order_date',
            label: 'Fiscal Year',
        });
        const explore = makeExplore([
            baseDim,
            customFiscalQuarter,
            customFiscalYear,
        ]);
        // The chart already uses fiscal_quarter — should still discover all custom granularities
        const metricQuery = makeMetricQuery([
            'orders_order_date_fiscal_quarter',
        ]);

        const result = getDateZoomCapabilities(explore, metricQuery);

        expect(result.hasDateDimension).toBe(true);
        expect(result.availableCustomGranularities).toEqual({
            fiscal_quarter: 'Fiscal Quarter',
            fiscal_year: 'Fiscal Year',
        });
    });

    it('collects custom granularities when the metric query uses a DATE-typed custom granularity dimension', () => {
        const baseDim = makeDimension({
            name: 'order_date',
            table: 'orders',
            type: DimensionType.DATE,
            isIntervalBase: true,
        });
        const customBiweekly = makeDimension({
            name: 'order_date_biweekly',
            table: 'orders',
            type: DimensionType.DATE,
            customTimeInterval: 'biweekly',
            timeIntervalBaseDimensionName: 'order_date',
            label: 'Bi-weekly',
        });
        const customFiscalQuarter = makeDimension({
            name: 'order_date_fiscal_quarter',
            table: 'orders',
            type: DimensionType.STRING,
            customTimeInterval: 'fiscal_quarter',
            timeIntervalBaseDimensionName: 'order_date',
            label: 'Fiscal Quarter',
        });
        const explore = makeExplore([
            baseDim,
            customBiweekly,
            customFiscalQuarter,
        ]);
        // The chart uses a DATE-typed custom granularity
        const metricQuery = makeMetricQuery(['orders_order_date_biweekly']);

        const result = getDateZoomCapabilities(explore, metricQuery);

        expect(result.hasDateDimension).toBe(true);
        expect(result.availableCustomGranularities).toEqual({
            biweekly: 'Bi-weekly',
            fiscal_quarter: 'Fiscal Quarter',
        });
    });

    it('resolves STRING-typed standard time-interval dimension (e.g. QUARTER_NAME) to its base', () => {
        const baseDim = makeDimension({
            name: 'order_date',
            table: 'orders',
            type: DimensionType.DATE,
            isIntervalBase: true,
        });
        const quarterNameDim = makeDimension({
            name: 'order_date_quarter_name',
            table: 'orders',
            type: DimensionType.STRING,
            timeInterval: 'QUARTER_NAME' as CompiledDimension['timeInterval'],
            timeIntervalBaseDimensionName: 'order_date',
        });
        const customFiscalQuarter = makeDimension({
            name: 'order_date_fiscal_quarter',
            table: 'orders',
            type: DimensionType.STRING,
            customTimeInterval: 'fiscal_quarter',
            timeIntervalBaseDimensionName: 'order_date',
            label: 'Fiscal Quarter',
        });
        const explore = makeExplore([
            baseDim,
            quarterNameDim,
            customFiscalQuarter,
        ]);
        const metricQuery = makeMetricQuery(['orders_order_date_quarter_name']);

        const result = getDateZoomCapabilities(explore, metricQuery);

        expect(result.hasDateDimension).toBe(true);
        expect(result.availableCustomGranularities).toEqual({
            fiscal_quarter: 'Fiscal Quarter',
        });
    });

    it('exposes standard granularity overrides keyed by DateGranularity', () => {
        const explore = {
            ...makeExplore([]),
            granularityLabels: { WEEK: 'Week starting Monday' },
        } as unknown as Explore;
        const metricQuery = makeMetricQuery([]);
        const caps = getDateZoomCapabilities(explore, metricQuery);
        expect(caps.availableCustomGranularities.Week).toBe(
            'Week starting Monday',
        );
    });

    it('exposes every custom granularity defined in the explore, regardless of which dim the chart currently queries', () => {
        const orderDate = makeDimension({
            name: 'order_date',
            table: 'orders',
            type: DimensionType.DATE,
        });
        const shippedDate = makeDimension({
            name: 'shipped_date',
            table: 'orders',
            type: DimensionType.DATE,
        });
        const shippedFiscal = makeDimension({
            name: 'shipped_date_fiscal_quarter',
            table: 'orders',
            type: DimensionType.STRING,
            customTimeInterval: 'fiscal_quarter',
            timeIntervalBaseDimensionName: 'shipped_date',
            label: 'Shipped Fiscal Quarter',
        });
        const explore = makeExplore([orderDate, shippedDate, shippedFiscal]);
        // Even though the chart only queries order_date, fiscal_quarter is
        // still surfaced. Dashboard-level date-zoom availability must not
        // depend on which dim a tile's metricQuery happens to reference,
        // otherwise configured customs get stripped whenever explore
        // discovery races with chart-query loading (PROD-7514).
        const metricQuery = makeMetricQuery(['orders_order_date']);

        const result = getDateZoomCapabilities(explore, metricQuery);

        expect(result.availableCustomGranularities).toEqual({
            fiscal_quarter: 'Shipped Fiscal Quarter',
        });
    });
});

describe('getDateZoomXAxisFieldId', () => {
    const makeCartesianConfig = (xField: string | undefined): ChartConfig => ({
        type: ChartType.CARTESIAN,
        config: {
            layout: xField
                ? { xField, yField: ['orders_revenue'] }
                : { yField: ['orders_revenue'] },
            eChartsConfig: {},
        },
    });

    it('returns the xField when it is a DATE dimension', () => {
        const explore = makeExplore([
            makeDimension({
                name: 'order_date_month',
                table: 'orders',
                type: DimensionType.DATE,
            }),
        ]);

        expect(
            getDateZoomXAxisFieldId(
                makeCartesianConfig('orders_order_date_month'),
                explore,
            ),
        ).toBe('orders_order_date_month');
    });

    it('returns the xField when it is a TIMESTAMP dimension', () => {
        const explore = makeExplore([
            makeDimension({
                name: 'created_at',
                table: 'orders',
                type: DimensionType.TIMESTAMP,
            }),
        ]);

        expect(
            getDateZoomXAxisFieldId(
                makeCartesianConfig('orders_created_at'),
                explore,
            ),
        ).toBe('orders_created_at');
    });

    it('returns a string-typed custom interval x-axis (resolves via base dimension)', () => {
        const explore = makeExplore([
            makeDimension({
                name: 'order_date',
                table: 'orders',
                type: DimensionType.DATE,
            }),
            makeDimension({
                name: 'order_date_fiscal_quarter',
                table: 'orders',
                type: DimensionType.STRING,
                customTimeInterval: 'fiscal_quarter',
                timeIntervalBaseDimensionName: 'order_date',
            }),
        ]);

        expect(
            getDateZoomXAxisFieldId(
                makeCartesianConfig('orders_order_date_fiscal_quarter'),
                explore,
            ),
        ).toBe('orders_order_date_fiscal_quarter');
    });

    it('returns undefined when the xField is not a date dimension', () => {
        const explore = makeExplore([
            makeDimension({
                name: 'status',
                table: 'orders',
                type: DimensionType.STRING,
            }),
        ]);

        expect(
            getDateZoomXAxisFieldId(
                makeCartesianConfig('orders_status'),
                explore,
            ),
        ).toBeUndefined();
    });

    it('returns undefined for non-cartesian charts', () => {
        const explore = makeExplore([
            makeDimension({
                name: 'order_date_month',
                table: 'orders',
                type: DimensionType.DATE,
            }),
        ]);
        const bigNumberConfig: ChartConfig = {
            type: ChartType.BIG_NUMBER,
            config: {},
        };

        expect(
            getDateZoomXAxisFieldId(bigNumberConfig, explore),
        ).toBeUndefined();
    });

    it('returns undefined when there is no xField', () => {
        const explore = makeExplore([
            makeDimension({
                name: 'order_date_month',
                table: 'orders',
                type: DimensionType.DATE,
            }),
        ]);

        expect(
            getDateZoomXAxisFieldId(makeCartesianConfig(undefined), explore),
        ).toBeUndefined();
    });

    it('returns undefined when the explore is not loaded', () => {
        expect(
            getDateZoomXAxisFieldId(
                makeCartesianConfig('orders_order_date_month'),
                undefined,
            ),
        ).toBeUndefined();
    });
});

describe('getChartZoomableFields', () => {
    it('returns only the chart-queried date/timestamp dimensions', () => {
        const dateDim = makeDimension({
            name: 'order_date',
            table: 'orders',
            type: DimensionType.DATE,
            label: 'Order date',
        });
        const createdAt = makeDimension({
            name: 'created_at',
            table: 'orders',
            type: DimensionType.TIMESTAMP,
            label: 'Created at',
        });
        const unusedDate = makeDimension({
            name: 'shipped_date',
            table: 'orders',
            type: DimensionType.DATE,
            label: 'Shipped date',
        });
        const stringDim = makeDimension({
            name: 'status',
            table: 'orders',
            type: DimensionType.STRING,
        });
        const explore = makeExplore([
            dateDim,
            createdAt,
            unusedDate,
            stringDim,
        ]);
        const metricQuery = makeMetricQuery([
            'orders_order_date',
            'orders_created_at',
            'orders_status',
        ]);

        expect(getChartZoomableFields(explore, metricQuery)).toEqual([
            {
                fieldId: 'orders_order_date',
                label: 'Order date',
                tableName: 'orders',
            },
            {
                fieldId: 'orders_created_at',
                label: 'Created at',
                tableName: 'orders',
            },
        ]);
    });

    it('includes a queried time-interval dimension (resolves to a base time dim)', () => {
        const baseDim = makeDimension({
            name: 'order_date',
            table: 'orders',
            type: DimensionType.DATE,
            isIntervalBase: true,
        });
        const monthDim = makeDimension({
            name: 'order_date_month',
            table: 'orders',
            type: DimensionType.DATE,
            timeInterval: 'MONTH' as CompiledDimension['timeInterval'],
            timeIntervalBaseDimensionName: 'order_date',
            label: 'Order date month',
        });
        const explore = makeExplore([baseDim, monthDim]);
        const metricQuery = makeMetricQuery(['orders_order_date_month']);

        expect(getChartZoomableFields(explore, metricQuery)).toEqual([
            {
                fieldId: 'orders_order_date_month',
                label: 'Order date month',
                tableName: 'orders',
            },
        ]);
    });

    it('returns an empty list when the chart queries no date dimensions', () => {
        const stringDim = makeDimension({
            name: 'status',
            table: 'orders',
            type: DimensionType.STRING,
        });
        const explore = makeExplore([stringDim]);
        const metricQuery = makeMetricQuery(['orders_status']);

        expect(getChartZoomableFields(explore, metricQuery)).toEqual([]);
    });
});
