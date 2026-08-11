import {
    DimensionType,
    FieldType,
    MetricType,
    SupportedDbtAdapter,
    VizAggregationOptions,
    VizIndexType,
    WeekDay,
    type ItemsMap,
    type WarehouseClient,
} from '@lightdash/common';
import { MERGE_EXPLORE_NAME, MergeQueryComposer } from './MergeQueryComposer';

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

const compose = () =>
    new MergeQueryComposer({
        sql: 'SELECT 1',
        itemsMap,
        columnOrder: ['merge_k0', 'a_followers_count'],
        limit: 500,
        warehouseClient: mockWarehouseClient,
    });

describe('MergeQueryComposer', () => {
    it('carries the merged statement through without recompiling it', () => {
        expect(compose().compile().query).toEqual('SELECT 1');
    });

    it('reports the merged items map as the query fields', () => {
        expect(compose().getFields()).toEqual(itemsMap);
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
            MERGE_EXPLORE_NAME,
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
            sql: 'SELECT 1',
            itemsMap,
            columnOrder: ['merge_k0', 'merge_k1', 'a_followers_count'],
            limit: 500,
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
});
