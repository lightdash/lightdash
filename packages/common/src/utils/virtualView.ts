import { ExploreCompiler } from '../compiler/exploreCompiler';
import { SupportedDbtAdapter } from '../types/dbt';
import { ExploreType, type Explore, type Table } from '../types/explore';
import {
    DimensionType,
    FieldType,
    friendlyName,
    type Dimension,
} from '../types/field';
import { type ParametersValuesMap } from '../types/parameters';
import { WarehouseTypes } from '../types/projects';
import {
    type TimeIntervalUnit,
    type WarehouseClient,
    type WarehouseSqlBuilder,
} from '../types/warehouse';
import { type VizColumn } from '../visualizations/types';
import { getDefaultTimeFrames, timeFrameConfigs, WeekDay } from './timeFrames';
import { defaultNullSafeEqualSql, quoteFieldReference } from './warehouse';

const isIntervalColumnType = (type: DimensionType): boolean =>
    type === DimensionType.DATE || type === DimensionType.TIMESTAMP;

/**
 * Build one dimension per column, plus the default time-interval dimensions
 * for date/timestamp columns. Shared by virtual views and external source
 * explores — both have no meta layer to override intervals.
 */
export const buildDimensionsFromColumns = (args: {
    tableName: string;
    tableLabel: string;
    columns: VizColumn[];
    warehouseSqlBuilder: WarehouseSqlBuilder;
}): Record<string, Dimension> => {
    const { tableName, tableLabel, columns, warehouseSqlBuilder } = args;
    const fieldQuoteChar = warehouseSqlBuilder.getFieldQuoteChar();
    const adapterType = warehouseSqlBuilder.getAdapterType();
    const startOfWeek = warehouseSqlBuilder.getStartOfWeek();
    const columnReferences = new Set(columns.map(({ reference }) => reference));

    return columns.reduce<Record<string, Dimension>>((acc, column) => {
        const type = column.type ?? DimensionType.STRING;
        const columnLabel = friendlyName(column.reference);
        const columnSql = quoteFieldReference(
            column.reference,
            fieldQuoteChar,
            adapterType,
        );
        const isIntervalBase = isIntervalColumnType(type);

        acc[column.reference] = {
            name: column.reference,
            label: columnLabel,
            type,
            table: tableName,
            fieldType: FieldType.DIMENSION,
            sql: columnSql,
            tableLabel,
            hidden: false,
            isIntervalBase,
        };

        if (isIntervalBase) {
            getDefaultTimeFrames(type).forEach((timeInterval) => {
                const intervalName = `${
                    column.reference
                }_${timeInterval.toLowerCase()}`;
                // A real column of the same name always wins
                if (columnReferences.has(intervalName)) {
                    return;
                }
                const intervalConfig = timeFrameConfigs[timeInterval];

                acc[intervalName] = {
                    name: intervalName,
                    label: `${columnLabel} ${intervalConfig
                        .getLabel()
                        .toLowerCase()}`,
                    type: intervalConfig.getDimensionType(type),
                    table: tableName,
                    fieldType: FieldType.DIMENSION,
                    sql: intervalConfig.getSql(
                        adapterType,
                        timeInterval,
                        columnSql,
                        type,
                        startOfWeek,
                    ),
                    tableLabel,
                    hidden: false,
                    timeInterval,
                    timeIntervalBaseDimensionName: column.reference,
                    timeIntervalBaseDimensionType: type,
                    groups: [columnLabel],
                    isIntervalBase: false,
                };
            });
        }

        return acc;
    }, {});
};

export const createVirtualView = (
    virtualViewName: string,
    sql: string,
    columns: VizColumn[],
    warehouseClient: WarehouseClient,
    label?: string,
    parameterValues?: ParametersValuesMap,
): Explore => {
    const exploreCompiler = new ExploreCompiler(warehouseClient);

    const tableLabel = friendlyName(virtualViewName);

    const dimensions = buildDimensionsFromColumns({
        tableName: virtualViewName,
        tableLabel,
        columns,
        warehouseSqlBuilder: warehouseClient,
    });

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

    const hasSavedParameters =
        parameterValues && Object.keys(parameterValues).length > 0;

    const virtualView: Explore = {
        ...explore,
        type: ExploreType.VIRTUAL,
        ...(hasSavedParameters
            ? { savedParameterValues: parameterValues }
            : {}),
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
        getSessionTimezone: async () => null,
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
            phaseTimings: {},
        }),
        runQuery: async () => ({ fields: {}, rows: [] }),
        test: async () => {},
        getStartOfWeek: () => WeekDay.MONDAY,
        getAdapterType: () => SupportedDbtAdapter.BIGQUERY,
        supportsCteMaterialization: () => true,
        getStringQuoteChar: () => "'",
        getEscapeStringQuoteChar: () => "''",
        getFieldQuoteChar: () => '"',
        getFloatingType: () => 'FLOAT',
        getNullSafeEqualSql: defaultNullSafeEqualSql,
        getNullSafeEqualJoinSql: defaultNullSafeEqualSql,
        getMetricSql: () => '',
        concatString: (...args) => args.join(''),
        getAllTables: async () => [],
        getFields: async () => ({}),
        parseWarehouseCatalog: () => ({}),
        parseError: (error) => error,
        escapeString: (value) => value,
        castToTimestamp: (date) => `CAST('${date.toISOString()}' AS TIMESTAMP)`,
        castToDate: (date) =>
            `CAST('${date.toISOString().slice(0, 10)}' AS DATE)`,
        castToNaiveTimestamp: (date) =>
            `CAST('${date.toISOString()}' AS TIMESTAMP)`,
        getIntervalSql: (value: number, unit: TimeIntervalUnit) =>
            `INTERVAL '${value} ${unit}'`,
        getTimestampDiffSeconds: (startTimestampSql, endTimestampSql) =>
            `EXTRACT(EPOCH FROM (${endTimestampSql} - ${startTimestampSql}))`,
        getMedianSql: (valueSql) =>
            `PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ${valueSql})`,
        buildArray: (elements) => `ARRAY[${elements.join(', ')}]`,
        buildArrayAgg: (expression, orderBy) =>
            orderBy
                ? `ARRAY_AGG(${expression} ORDER BY ${orderBy})`
                : `ARRAY_AGG(${expression})`,
    };

    return createVirtualView(
        virtualViewName,
        sql,
        columns,
        fakeWarehouseClient,
    );
};
