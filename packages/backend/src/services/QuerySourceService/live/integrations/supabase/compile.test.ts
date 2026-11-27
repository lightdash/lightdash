import {
    ApiConnectorType,
    FilterOperator,
    getApiSourceQueryIssues,
    getItemMap,
    SupportedDbtAdapter,
    type FilterRule,
    type MetricQuery,
} from '@lightdash/common';
import { warehouseSqlBuilderFromType } from '@lightdash/warehouses';
import { supabaseIntegration } from '.';
import { buildLiveExplore } from '../../explores/definition';
import { parseLiveRequest } from '../../integration';
import { compileSupabaseQuery } from './compile';
import {
    readSupabaseColumns,
    SUPABASE_TABLE_EXPLORE,
    withSupabaseColumns,
} from './model';
import { ORDERS_TABLE } from './supabase.fixtures';

const DEFINITION = withSupabaseColumns(
    SUPABASE_TABLE_EXPLORE,
    readSupabaseColumns(ORDERS_TABLE),
);

const EXPLORE = buildLiveExplore({
    definition: DEFINITION,
    exploreName: 'orders_table',
    label: 'Orders',
    connectionUuid: 'connection-uuid',
    integration: ApiConnectorType.SUPABASE,
    baseVersion: 1,
    capabilities: supabaseIntegration.query.capabilities,
    warehouseSqlBuilder: warehouseSqlBuilderFromType(
        SupportedDbtAdapter.DUCKDB,
    ),
});

const rule = (
    field: string,
    operator: FilterOperator,
    values: unknown[] = [],
): FilterRule => ({
    id: `${field}-${operator}`,
    target: { fieldId: `orders_table_${field}` },
    operator,
    values,
});

const query = (overrides: Partial<MetricQuery> = {}): MetricQuery => ({
    exploreName: 'orders_table',
    dimensions: ['orders_table_status', 'orders_table_amount'],
    metrics: [],
    filters: {},
    sorts: [],
    limit: 500,
    tableCalculations: [],
    ...overrides,
});

const compile = (metricQuery: MetricQuery) =>
    JSON.parse(compileSupabaseQuery({ explore: EXPLORE, metricQuery }).query);

const withFilters = (rules: FilterRule[]) =>
    query({
        filters: { dimensions: { id: 'root', and: rules } },
    });

describe('Supabase columns', () => {
    it('turns each column into a dimension of its type', () => {
        expect(
            DEFINITION.dimensions.map(({ name, apiName, type, label }) => ({
                name,
                apiName,
                type,
                label,
            })),
        ).toEqual([
            { name: 'id', apiName: 'id', type: 'number', label: 'Id' },
            {
                name: 'created_at',
                apiName: 'created_at',
                type: 'timestamp',
                label: 'Created at',
            },
            {
                name: 'order_date',
                apiName: 'order_date',
                type: 'date',
                label: 'Order date',
            },
            {
                name: 'status',
                apiName: 'status',
                type: 'string',
                label: 'Status',
            },
            {
                name: 'amount',
                apiName: 'amount',
                type: 'number',
                label: 'Amount',
            },
            {
                name: 'is_paid',
                apiName: 'is_paid',
                type: 'boolean',
                label: 'Is paid',
            },
            {
                name: 'metadata',
                apiName: 'metadata',
                type: 'string',
                label: 'Metadata',
            },
            { name: 'tags', apiName: 'tags', type: 'string', label: 'Tags' },
            {
                name: 'customer_name',
                apiName: 'Customer Name',
                type: 'string',
                label: 'Customer Name',
            },
        ]);
    });

    it('keeps column comments and drops key markers', () => {
        const byName = Object.fromEntries(
            DEFINITION.dimensions.map((field) => [field.name, field]),
        );
        expect(byName.id.description).toBe('This is a Primary Key.');
        expect(byName.status.description).toBe('Order state');
        expect(byName.amount.description).toBe('amount (numeric)');
    });

    it('gives clashing names a suffix and reads an unknown shape as no columns', () => {
        const definition = withSupabaseColumns(
            SUPABASE_TABLE_EXPLORE,
            readSupabaseColumns({
                properties: { 'a-b': {}, a_b: {}, 'A B': {} },
            }),
        );
        expect(definition.dimensions.map(({ name }) => name)).toEqual([
            'a_b',
            'a_b_2',
            'a_b_3',
        ]);
        expect(readSupabaseColumns({ nope: true })).toEqual([]);
    });
});

describe('compileSupabaseQuery', () => {
    it('selects the dimensions by column name', () => {
        expect(
            compile(
                query({
                    dimensions: [
                        'orders_table_customer_name',
                        'orders_table_amount',
                    ],
                }),
            ),
        ).toEqual({ select: ['Customer Name', 'amount'] });
    });

    it('sorts in Supabase', () => {
        const compiled = compileSupabaseQuery({
            explore: EXPLORE,
            metricQuery: query({
                sorts: [
                    { fieldId: 'orders_table_amount', descending: true },
                    { fieldId: 'orders_table_status', descending: false },
                ],
            }),
        });
        expect(compiled.localSorts).toEqual([]);
        expect(JSON.parse(compiled.query).order).toEqual([
            { column: 'amount', ascending: false },
            { column: 'status', ascending: true },
        ]);
    });

    it('translates each filter', () => {
        expect(
            compile(
                withFilters([
                    rule('status', FilterOperator.EQUALS, ['paid']),
                    rule('status', FilterOperator.NOT_EQUALS, ['void', 'lost']),
                    rule('customer_name', FilterOperator.INCLUDE, [
                        'acme',
                        'globex',
                    ]),
                    rule('status', FilterOperator.STARTS_WITH, ['pa']),
                    rule('amount', FilterOperator.GREATER_THAN, [100]),
                    rule('is_paid', FilterOperator.EQUALS, [true]),
                    rule('metadata', FilterOperator.NOT_NULL),
                    rule('order_date', FilterOperator.IN_BETWEEN, [
                        '2026-01-01',
                        '2026-01-31',
                    ]),
                    rule('created_at', FilterOperator.LESS_THAN, [
                        '2026-02-01',
                    ]),
                ]),
            ).filters,
        ).toEqual([
            { column: 'status', operator: 'eq', value: 'paid' },
            { column: 'status', operator: 'not_in', value: ['void', 'lost'] },
            {
                column: 'Customer Name',
                operator: 'ilike',
                value: ['*acme*', '*globex*'],
            },
            { column: 'status', operator: 'ilike', value: 'pa*' },
            { column: 'amount', operator: 'gt', value: '100' },
            { column: 'is_paid', operator: 'eq', value: 'true' },
            { column: 'metadata', operator: 'not_null' },
            { column: 'order_date', operator: 'gte', value: '2026-01-01' },
            { column: 'order_date', operator: 'lte', value: '2026-01-31' },
            {
                column: 'created_at',
                operator: 'lt',
                value: '2026-02-01T00:00:00.000Z',
            },
        ]);
    });

    it('lets the shared check refuse what Supabase cannot filter', () => {
        const issues = getApiSourceQueryIssues(
            EXPLORE.apiSource!,
            withFilters([
                rule('created_at', FilterOperator.EQUALS, ['2026-01-01']),
                rule('metadata', FilterOperator.EQUALS, ['{}']),
            ]),
            { itemsMap: getItemMap(EXPLORE) },
        );
        expect(issues.length).toBeGreaterThan(0);
    });

    it('needs a column', () => {
        expect(() => compile(query({ dimensions: [] }))).toThrow(
            'Pick at least one column',
        );
    });

    it('writes a request the integration reads back', () => {
        const compiled = compileSupabaseQuery({
            explore: EXPLORE,
            metricQuery: withFilters([
                rule('status', FilterOperator.EQUALS, ['paid', 'open']),
            ]),
        });
        expect(() =>
            parseLiveRequest(supabaseIntegration, compiled.query),
        ).not.toThrow();
    });
});
