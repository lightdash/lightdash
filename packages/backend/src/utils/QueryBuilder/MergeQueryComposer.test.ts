import {
    DimensionType,
    FieldType,
    MERGE_TABLE_NAME,
    MetricType,
    SupportedDbtAdapter,
    VizAggregationOptions,
    VizIndexType,
    WeekDay,
    type ItemsMap,
    type WarehouseClient,
} from '@lightdash/common';
import { MergeQueryComposer } from './MergeQueryComposer';

const mockWarehouseClient = {
    getFieldQuoteChar: () => '"',
    getAdapterType: () => SupportedDbtAdapter.POSTGRES,
    getStartOfWeek: () => WeekDay.MONDAY,
    getStringQuoteChar: () => "'",
    escapeString: (value: string) => value.replaceAll("'", "''"),
    supportsCteMaterialization: () => true,
    credentials: { type: 'postgres' },
} as unknown as WarehouseClient;

const itemsMap = {
    merge_k0: {
        fieldType: FieldType.DIMENSION,
        type: DimensionType.DATE,
        name: 'k0',
        label: 'Date',
        table: 'merge',
        tableLabel: 'Merged',
        sql: '',
        hidden: false,
    },
    merge_k1: {
        fieldType: FieldType.DIMENSION,
        type: DimensionType.STRING,
        name: 'k1',
        label: 'Status',
        table: 'merge',
        tableLabel: 'Merged',
        sql: '',
        hidden: false,
    },
    a_followers_count: {
        fieldType: FieldType.METRIC,
        type: MetricType.COUNT_DISTINCT,
        name: 'followers_count',
        label: 'New followers',
        table: 'a',
        tableLabel: 'Query A',
        sql: '',
        hidden: false,
    },
} as ItemsMap;

const typedColumns = [
    {
        reference: 'merge_k0',
        type: DimensionType.DATE,
        origin: {
            kind: 'joinKey' as const,
            fieldIdBySourceId: { a: 'a_date', b: 'b_date' },
        },
    },
    {
        reference: 'merge_k1',
        type: DimensionType.STRING,
        origin: {
            kind: 'joinKey' as const,
            fieldIdBySourceId: { a: 'a_name', b: 'b_name' },
        },
    },
    {
        reference: 'a_followers_count',
        type: DimensionType.NUMBER,
        origin: {
            kind: 'source' as const,
            sourceId: 'a',
            sourceFieldId: 'followers_count',
        },
    },
];

const parameterMetadata = {
    parameterReferences: ['date_parameter'],
    usedParametersValues: { date_parameter: '2024-01-01' },
};

const compose = () =>
    new MergeQueryComposer({
        coreSql: 'SELECT 1',
        terminalWrapper: {
            orderBy: [],
            limit: null,
            sourceLimitExceededSql: null,
        },
        itemsMap,
        typedColumns,
        columnOrder: ['merge_k0', 'a_followers_count'],
        limit: 500,
        ...parameterMetadata,
        warehouseClient: mockWarehouseClient,
    });

describe('MergeQueryComposer', () => {
    it('carries the merged statement through without recompiling it', () => {
        expect(compose().compile().query).toEqual('SELECT 1');
    });

    it('reports the merged items map as the query fields', () => {
        expect(compose().getFields()).toEqual(itemsMap);
    });

    it('reports the parameters embedded during source compilation', () => {
        expect(compose().getParameterReferences()).toEqual(['date_parameter']);
        expect(compose().getUsedParameters()).toEqual(
            parameterMetadata.usedParametersValues,
        );
    });

    // Everything downstream looks fields up by id, so a composer whose fields
    // disagree with the column order silently renders empty columns.
    it('describes the merged result in field ids, split by kind', () => {
        const metricQuery = compose().getMetricQuery();

        expect(metricQuery.dimensions).toEqual(['merge_k0']);
        expect(metricQuery.metrics).toEqual(['a_followers_count']);
    });

    // A real explore name here would let a consumer compile against one side
    // of the join and quietly return that side's numbers.
    it('names a sentinel explore rather than either source', () => {
        expect(compose().getMetricQuery().exploreName).toEqual(
            MERGE_TABLE_NAME,
        );
    });

    it('leaves filters and sorts empty, since the sources own them', () => {
        const metricQuery = compose().getMetricQuery();

        expect(metricQuery.filters).toEqual({});
        expect(metricQuery.sorts).toEqual([]);
        expect(metricQuery.limit).toEqual(500);
    });

    // The pipeline is join within an explore, merge between explores, then
    // pivot: a merged result reaches the standard pivot stage like any other
    // query, not a bespoke one.
    it('wraps the merged statement with the standard pivot stage', () => {
        const composer = new MergeQueryComposer({
            coreSql: 'SELECT 1',
            terminalWrapper: {
                orderBy: [],
                limit: null,
                sourceLimitExceededSql: null,
            },
            itemsMap,
            typedColumns,
            columnOrder: ['merge_k0', 'merge_k1', 'a_followers_count'],
            limit: 500,
            ...parameterMetadata,
            warehouseClient: mockWarehouseClient,
            pivotConfiguration: {
                indexColumn: { reference: 'merge_k0', type: VizIndexType.TIME },
                valuesColumns: [
                    {
                        reference: 'a_followers_count',
                        aggregation: VizAggregationOptions.ANY,
                    },
                ],
                groupByColumns: [{ reference: 'merge_k1' }],
                sortBy: undefined,
            },
        });

        const sql = composer.getSql({ columnLimit: 100 });
        expect(sql).toContain('SELECT 1');
        expect(sql).toContain('row_index');
        expect(sql).toContain('column_index');
        // The base compile stays unwrapped: the pivot is a stage over it.
        expect(composer.compile().query).toEqual('SELECT 1');
    });

    it('keeps source-cap assertions outside the presentation pivot', () => {
        const composer = new MergeQueryComposer({
            coreSql: 'SELECT 1',
            terminalWrapper: {
                orderBy: ['"merge_k0"'],
                limit: 500,
                sourceLimitExceededSql: 'FALSE',
            },
            itemsMap,
            typedColumns,
            columnOrder: ['merge_k0', 'merge_k1', 'a_followers_count'],
            limit: 500,
            ...parameterMetadata,
            warehouseClient: mockWarehouseClient,
            pivotConfiguration: {
                indexColumn: { reference: 'merge_k0', type: VizIndexType.TIME },
                valuesColumns: [
                    {
                        reference: 'a_followers_count',
                        aggregation: VizAggregationOptions.ANY,
                    },
                ],
                groupByColumns: [{ reference: 'merge_k1' }],
                sortBy: undefined,
            },
        });

        const sql = composer.getSql({ columnLimit: 100 });
        expect(sql.indexOf('pivot_query')).toBeLessThan(
            sql.indexOf('RIGHT JOIN'),
        );
        expect(sql).not.toContain('ORDER BY "merge_k0"');
    });
});
