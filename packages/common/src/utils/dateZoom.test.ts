import type { Explore } from '../types/explore';
import { ExploreType } from '../types/explore';
import { DimensionType, FieldType } from '../types/field';
import type { CompiledDimension } from '../types/field';
import type { MetricQuery } from '../types/metricQuery';
import { getDateZoomCapabilities } from './dateZoom';

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

    it('falls back to the derived dimension when base dimension is not found', () => {
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

        // Falls back to the derived dim's own type (DATE)
        expect(result.hasDateDimension).toBe(true);
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

    it('does not include custom granularities from unrelated base dimensions', () => {
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
        // Only querying order_date — should NOT pick up shipped_date's custom granularities
        const metricQuery = makeMetricQuery(['orders_order_date']);

        const result = getDateZoomCapabilities(explore, metricQuery);

        expect(result.availableCustomGranularities).toEqual({});
    });
});
