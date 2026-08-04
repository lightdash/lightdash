import { SupportedDbtAdapter } from '../types/dbt';
import { ExploreType } from '../types/explore';
import { DimensionType } from '../types/field';
import type { ParametersValuesMap } from '../types/parameters';
import { WarehouseTypes } from '../types/projects';
import { TimeFrames } from '../types/timeFrames';
import type { WarehouseClient } from '../types/warehouse';
import type { VizColumn } from '../visualizations/types';
import { WeekDay } from './timeFrames';
import { createVirtualView } from './virtualView';
import { defaultNullSafeEqualSql } from './warehouse';

const fakeWarehouseClient: WarehouseClient = {
    credentials: {
        type: WarehouseTypes.POSTGRES,
        host: '',
        user: '',
        password: '',
        port: 5432,
        dbname: '',
        schema: '',
        sshTunnelHost: '',
        sshTunnelPort: 22,
        sshTunnelUser: '',
    },
    getCatalog: async () => ({}),
    streamQuery: async () => {},
    executeAsyncQuery: async () => ({
        queryId: null,
        queryMetadata: null,
        totalRows: 0,
        durationMs: 0,
        phaseTimings: {},
    }),
    runQuery: async () => ({ fields: {}, rows: [] }),
    test: async () => {},
    getStartOfWeek: () => WeekDay.MONDAY,
    getAdapterType: () => SupportedDbtAdapter.POSTGRES,
    supportsCteMaterialization: () => true,
    getStringQuoteChar: () => "'",
    getEscapeStringQuoteChar: () => "''",
    getFieldQuoteChar: () => '"',
    getFloatingType: () => 'FLOAT',
    getNullSafeEqualSql: defaultNullSafeEqualSql,
    getNullSafeEqualJoinSql: defaultNullSafeEqualSql,
    getMetricSql: () => '',
    concatString: (...args: string[]) => args.join(''),
    getAllTables: async () => [],
    getFields: async () => ({}),
    parseWarehouseCatalog: () => ({}),
    parseError: (error: Error) => error,
    escapeString: (value: string) => value,
    castToTimestamp: (date: Date) =>
        `CAST('${date.toISOString()}' AS TIMESTAMP)`,
    getIntervalSql: (value: number, unit: string) =>
        `INTERVAL '${value} ${unit}'`,
    getTimestampDiffSeconds: (
        startTimestampSql: string,
        endTimestampSql: string,
    ) => `EXTRACT(EPOCH FROM (${endTimestampSql} - ${startTimestampSql}))`,
    getMedianSql: (valueSql: string) =>
        `PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ${valueSql})`,
    buildArray: (elements: string[]) => `ARRAY[${elements.join(', ')}]`,
    buildArrayAgg: (expression: string, orderBy?: string) =>
        orderBy
            ? `ARRAY_AGG(${expression} ORDER BY ${orderBy})`
            : `ARRAY_AGG(${expression})`,
};

const columns: VizColumn[] = [
    { reference: 'order_id', type: DimensionType.NUMBER },
    { reference: 'status', type: DimensionType.STRING },
];

describe('createVirtualView', () => {
    test('should create a virtual view with basic properties', () => {
        const result = createVirtualView(
            'my_view',
            'SELECT order_id, status FROM orders',
            columns,
            fakeWarehouseClient,
        );

        expect(result.type).toBe(ExploreType.VIRTUAL);
        expect(result.name).toBe('my_view');
        expect(result.tables.my_view.sqlTable).toBe(
            '(SELECT order_id, status FROM orders)',
        );
    });

    test('should store savedParameterValues on the explore when provided', () => {
        const sql =
            'SELECT order_id, status FROM orders WHERE status = ${ld.parameters.order_status}';
        const parameterValues: ParametersValuesMap = {
            order_status: 'completed',
        };

        const result = createVirtualView(
            'my_view',
            sql,
            columns,
            fakeWarehouseClient,
            undefined, // label
            parameterValues,
        );

        // The virtual view explore should have savedParameterValues
        expect(result.savedParameterValues).toEqual({
            order_status: 'completed',
        });
    });

    test('should store multiple parameter values', () => {
        const sql =
            'SELECT * FROM orders WHERE status = ${ld.parameters.status} AND region = ${ld.parameters.region}';
        const parameterValues: ParametersValuesMap = {
            status: 'completed',
            region: 'EU',
        };

        const result = createVirtualView(
            'my_view',
            sql,
            columns,
            fakeWarehouseClient,
            undefined,
            parameterValues,
        );

        expect(result.savedParameterValues).toEqual({
            status: 'completed',
            region: 'EU',
        });
    });

    test('should escape active quote characters in raw column references', () => {
        const result = createVirtualView(
            'my_view',
            'SELECT 1 AS "total""revenue"',
            [{ reference: 'total"revenue', type: DimensionType.NUMBER }],
            fakeWarehouseClient,
        );

        expect(result.tables.my_view.dimensions['total"revenue'].sql).toBe(
            '"total""revenue"',
        );
    });
    test('should not create interval dimensions for non-date columns', () => {
        const result = createVirtualView(
            'my_view',
            'SELECT order_id, status FROM orders',
            columns,
            fakeWarehouseClient,
        );

        expect(
            Object.keys(result.tables.my_view.dimensions).sort(),
        ).toStrictEqual(['order_id', 'status']);
        expect(result.tables.my_view.dimensions.order_id.isIntervalBase).toBe(
            false,
        );
    });

    test('should expand a date column into interval dimensions', () => {
        const result = createVirtualView(
            'my_view',
            'SELECT order_date FROM orders',
            [{ reference: 'order_date', type: DimensionType.DATE }],
            fakeWarehouseClient,
        );

        const { dimensions } = result.tables.my_view;

        expect(Object.keys(dimensions).sort()).toStrictEqual([
            'order_date',
            'order_date_day',
            'order_date_month',
            'order_date_quarter',
            'order_date_week',
            'order_date_year',
        ]);
        expect(dimensions.order_date.isIntervalBase).toBe(true);
        expect(dimensions.order_date_month).toMatchObject({
            label: 'Order date month',
            type: DimensionType.DATE,
            timeInterval: TimeFrames.MONTH,
            timeIntervalBaseDimensionName: 'order_date',
            timeIntervalBaseDimensionType: DimensionType.DATE,
            groups: ['Order date'],
            isIntervalBase: false,
        });
        expect(
            result.tables.my_view.dimensions.order_date_month.compiledSql,
        ).toBe(`DATE_TRUNC('MONTH', "order_date")`);
    });

    test('should include a raw dimension for timestamp columns', () => {
        const result = createVirtualView(
            'my_view',
            'SELECT created_at FROM orders',
            [{ reference: 'created_at', type: DimensionType.TIMESTAMP }],
            fakeWarehouseClient,
        );

        const { dimensions } = result.tables.my_view;

        expect(Object.keys(dimensions).sort()).toStrictEqual([
            'created_at',
            'created_at_day',
            'created_at_month',
            'created_at_quarter',
            'created_at_raw',
            'created_at_week',
            'created_at_year',
        ]);
        expect(dimensions.created_at_raw.type).toBe(DimensionType.TIMESTAMP);
        expect(dimensions.created_at_day.type).toBe(DimensionType.DATE);
    });

    test('should not overwrite a real column that collides with an interval name', () => {
        const result = createVirtualView(
            'my_view',
            'SELECT order_date, order_date_week FROM orders',
            [
                { reference: 'order_date', type: DimensionType.DATE },
                { reference: 'order_date_week', type: DimensionType.STRING },
            ],
            fakeWarehouseClient,
        );

        const collidingDimension =
            result.tables.my_view.dimensions.order_date_week;

        expect(collidingDimension.type).toBe(DimensionType.STRING);
        expect(collidingDimension.timeInterval).toBeUndefined();
    });
});
