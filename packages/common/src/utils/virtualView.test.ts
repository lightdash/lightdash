import { SupportedDbtAdapter } from '../types/dbt';
import { ExploreType } from '../types/explore';
import { DimensionType } from '../types/field';
import type { ParametersValuesMap } from '../types/parameters';
import { WarehouseTypes } from '../types/projects';
import type { WarehouseClient } from '../types/warehouse';
import type { VizColumn } from '../visualizations/types';
import { WeekDay } from './timeFrames';
import { createVirtualView } from './virtualView';

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
    getAsyncQueryResults: async () => ({
        queryId: null,
        queryMetadata: null,
        totalRows: 0,
        durationMs: 0,
        fields: {},
        pageCount: 0,
        rows: [],
    }),
    streamQuery: async () => {},
    executeAsyncQuery: async () => ({
        queryId: null,
        queryMetadata: null,
        totalRows: 0,
        durationMs: 0,
    }),
    runQuery: async () => ({ fields: {}, rows: [] }),
    test: async () => {},
    getStartOfWeek: () => WeekDay.MONDAY,
    getAdapterType: () => SupportedDbtAdapter.POSTGRES,
    getStringQuoteChar: () => "'",
    getEscapeStringQuoteChar: () => "''",
    getFieldQuoteChar: () => '"',
    getFloatingType: () => 'FLOAT',
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
});
