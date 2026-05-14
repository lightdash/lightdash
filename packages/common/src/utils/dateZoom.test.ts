import type { Explore } from '../types/explore';
import { ExploreType } from '../types/explore';
import { DimensionType, FieldType } from '../types/field';
import type { CompiledDimension } from '../types/field';
import type { MetricQuery } from '../types/metricQuery';
import {
    getDateZoomCapabilities,
    getTimeDimensionsMap,
    resolveBaseDimension,
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
