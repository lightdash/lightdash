import { ExploreCompiler } from '../compiler/exploreCompiler';
import { SupportedDbtAdapter } from '../types/dbt';
import { ExploreType, type Explore, type Table } from '../types/explore';
import {
    DimensionType,
    FieldType,
    friendlyName,
    type Dimension,
} from '../types/field';
import { WarehouseTypes } from '../types/projects';
import { type WarehouseClient } from '../types/warehouse';
import { type VizColumn } from '../visualizations/types';
import { WeekDay } from './timeFrames';

export const createVirtualView = (
    virtualViewName: string,
    sql: string,
    columns: VizColumn[],
    warehouseClient: WarehouseClient,
    label?: string,
): Explore => {
    const exploreCompiler = new ExploreCompiler(warehouseClient);

    const fieldQuoteChar = warehouseClient.getFieldQuoteChar();

    const dimensions = columns.reduce<Record<string, Dimension>>(
        (acc, column) => {
            acc[column.reference] = {
                name: column.reference,
                label: friendlyName(column.reference),
                type: column.type ?? DimensionType.STRING,
                table: virtualViewName,
                fieldType: FieldType.DIMENSION,
                sql: `${fieldQuoteChar}${column.reference}${fieldQuoteChar}`,
                tableLabel: friendlyName(virtualViewName),
                hidden: false,
            };
            return acc;
        },
        {},
    );

    const compiledTable: Table = {
        name: virtualViewName,
        label: label || friendlyName(virtualViewName),
        sqlTable: `(${sql})`, // Wrap the sql in a subquery to avoid issues with reserved words
        dimensions,
        metrics: {},
        lineageGraph: { nodes: [], edges: [] },
        database: warehouseClient.credentials.type,
        schema: '', // TODO: what should this be?
    };

    const explore = exploreCompiler.compileExplore({
        name: virtualViewName,
        label: label || friendlyName(virtualViewName),
        tags: [],
        baseTable: virtualViewName,
        joinedTables: [],
        tables: { [virtualViewName]: compiledTable },
        targetDatabase: warehouseClient.getAdapterType(),
        meta: {},
    });

    const virtualView = {
        ...explore,
        type: ExploreType.VIRTUAL,
    };

    return virtualView;
};

export const createTemporaryVirtualView = (
    virtualViewName: string,
    sql: string,
    columns: VizColumn[],
): Explore => {
    // Create a fake warehouseClient for compilation purposes
    const fakeWarehouseClient: WarehouseClient = {
        credentials: {
            type: WarehouseTypes.BIGQUERY,
            project: '',
            dataset: '',
            timeoutSeconds: 0,
            priority: 'interactive',
            keyfileContents: {},
            retries: 3,
            location: '',
            maximumBytesBilled: 0,
        },
        getCatalog: async () => ({}),
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
        getAdapterType: () => SupportedDbtAdapter.BIGQUERY,
        getStringQuoteChar: () => "'",
        getEscapeStringQuoteChar: () => "''",
        getFieldQuoteChar: () => '"',
        getMetricSql: () => '',
        concatString: (...args) => args.join(''),
        getAllTables: async () => [],
        getFields: async () => ({}),
        parseWarehouseCatalog: () => ({}),
        parseError: (error) => error,
    };

    return createVirtualView(
        virtualViewName,
        sql,
        columns,
        fakeWarehouseClient,
    );
};
