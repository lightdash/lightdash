import { type Explore } from '../types/explore';
import {
    CustomDimensionType,
    DimensionType,
    FieldType,
    MetricType,
    type CompiledDimension,
    type CompiledMetric,
} from '../types/field';
import { FilterOperator } from '../types/filter';
import { type MetricQuery } from '../types/metricQuery';
import {
    exploreHasAiAccessRules,
    filterExploreForAi,
    getAiAccessRules,
    metricQueryUsesAiHiddenData,
} from './aiAccess';

const dimension = (
    table: string,
    name: string,
    extra: Partial<CompiledDimension> = {},
): CompiledDimension => ({
    fieldType: FieldType.DIMENSION,
    type: DimensionType.STRING,
    name,
    label: name,
    table,
    tableLabel: table,
    sql: `\${TABLE}.${name}`,
    compiledSql: `"${table}".${name}`,
    tablesReferences: [table],
    hidden: false,
    ...extra,
});

const metric = (
    table: string,
    name: string,
    extra: Partial<CompiledMetric> = {},
): CompiledMetric => ({
    fieldType: FieldType.METRIC,
    type: MetricType.COUNT,
    name,
    label: name,
    table,
    tableLabel: table,
    sql: `\${TABLE}.customer_id`,
    compiledSql: `COUNT("${table}".customer_id)`,
    tablesReferences: [table],
    hidden: false,
    ...extra,
});

const buildExplore = ({
    customersAiAccess,
    ordersAiAccess,
}: {
    customersAiAccess?: 'never';
    ordersAiAccess?: 'never';
} = {}): Explore =>
    ({
        name: 'customers',
        label: 'Customers',
        tags: [],
        baseTable: 'customers',
        joinedTables: [
            {
                table: 'orders',
                sqlOn: '${customers.customer_id} = ${orders.customer_id}',
                compiledSqlOn: '"customers".customer_id = "orders".customer_id',
            },
        ],
        targetDatabase: 'postgres',
        tables: {
            customers: {
                name: 'customers',
                label: 'Customers',
                database: 'db',
                schema: 'public',
                sqlTable: 'customers',
                aiAccess: customersAiAccess,
                dimensions: {
                    customer_id: dimension('customers', 'customer_id'),
                    email: dimension('customers', 'email', {
                        aiAccess: 'never',
                    }),
                    email_upper: dimension('customers', 'email_upper', {
                        sql: 'UPPER(${email})',
                    }),
                    email_raw: dimension('customers', 'email_raw', {
                        sql: 'LOWER(${TABLE}.email)',
                    }),
                    name: dimension('customers', 'name'),
                },
                metrics: {
                    customer_count: metric('customers', 'customer_count'),
                    email_count: metric('customers', 'email_count', {
                        sql: '${TABLE}.email',
                        dimensionReference: 'customers_email',
                    }),
                },
                lineageGraph: {},
            },
            orders: {
                name: 'orders',
                label: 'Orders',
                database: 'db',
                schema: 'public',
                sqlTable: 'orders',
                aiAccess: ordersAiAccess,
                dimensions: {
                    order_id: dimension('orders', 'order_id'),
                },
                metrics: {
                    total: metric('orders', 'total'),
                },
                lineageGraph: {},
            },
        },
    }) as unknown as Explore;

const query = (overrides: Partial<MetricQuery> = {}): MetricQuery => ({
    exploreName: 'customers',
    dimensions: ['customers_name'],
    metrics: ['customers_customer_count'],
    filters: {},
    sorts: [],
    limit: 10,
    tableCalculations: [],
    ...overrides,
});

describe('getAiAccessRules', () => {
    it('hides marked fields and fields built from them', () => {
        const { hiddenFieldIds } = getAiAccessRules(buildExplore());

        expect([...hiddenFieldIds].sort()).toEqual([
            'customers_email',
            'customers_email_count',
            'customers_email_raw',
            'customers_email_upper',
        ]);
    });

    it('hides every field of a marked model and fields referencing it', () => {
        const explore = buildExplore({ ordersAiAccess: 'never' });
        explore.tables.customers.metrics.order_total = metric(
            'customers',
            'order_total',
            { sql: 'SUM(${orders.total})', tablesReferences: ['orders'] },
        );
        const { hiddenFieldIds, hiddenTables } = getAiAccessRules(explore);

        expect([...hiddenTables]).toEqual(['orders']);
        expect(hiddenFieldIds.has('orders_order_id')).toBe(true);
        expect(hiddenFieldIds.has('orders_total')).toBe(true);
        expect(hiddenFieldIds.has('customers_order_total')).toBe(true);
        expect(hiddenFieldIds.has('customers_name')).toBe(false);
    });
});

describe('filterExploreForAi', () => {
    it('returns the explore unchanged when nothing is marked', () => {
        const explore = buildExplore();
        explore.tables.customers.dimensions.email.aiAccess = undefined;
        explore.tables.customers.dimensions.email_upper.sql = '${name}';

        expect(exploreHasAiAccessRules(explore)).toBe(false);
        expect(filterExploreForAi(explore)).toBe(explore);
    });

    it('removes hidden fields and keeps the rest', () => {
        const filtered = filterExploreForAi(buildExplore());

        expect(Object.keys(filtered!.tables.customers.dimensions)).toEqual([
            'customer_id',
            'name',
        ]);
        expect(Object.keys(filtered!.tables.customers.metrics)).toEqual([
            'customer_count',
        ]);
        expect(filtered!.tables.orders).toBeDefined();
    });

    it('removes a hidden joined model', () => {
        const filtered = filterExploreForAi(
            buildExplore({ ordersAiAccess: 'never' }),
        );

        expect(filtered!.tables.orders).toBeUndefined();
        expect(filtered!.joinedTables).toEqual([]);
    });

    it('drops the unfiltered copy of tables', () => {
        const explore = {
            ...buildExplore(),
            unfilteredTables: buildExplore().tables,
        };

        expect(filterExploreForAi(explore)).not.toHaveProperty(
            'unfilteredTables',
        );
    });

    it('hides the whole explore when its base model is hidden', () => {
        expect(
            filterExploreForAi(buildExplore({ customersAiAccess: 'never' })),
        ).toBeUndefined();
    });
});

describe('metricQueryUsesAiHiddenData', () => {
    const explore = buildExplore();

    it('allows a query on visible fields', () => {
        expect(metricQueryUsesAiHiddenData(explore, query())).toBe(false);
    });

    it.each<[string, Partial<MetricQuery>]>([
        ['selects a hidden dimension', { dimensions: ['customers_email'] }],
        [
            'selects a field built from a hidden one',
            { dimensions: ['customers_email_upper'] },
        ],
        ['selects a hidden metric', { metrics: ['customers_email_count'] }],
        [
            'filters on a hidden field',
            {
                filters: {
                    dimensions: {
                        id: 'group',
                        and: [
                            {
                                id: 'rule',
                                target: { fieldId: 'customers_email' },
                                operator: FilterOperator.EQUALS,
                                values: ['a@example.com'],
                            },
                        ],
                    },
                },
            },
        ],
        [
            'sorts by a hidden field',
            { sorts: [{ fieldId: 'customers_email', descending: false }] },
        ],
        [
            'adds a custom metric on a hidden dimension',
            {
                additionalMetrics: [
                    {
                        name: 'email_min',
                        table: 'customers',
                        type: MetricType.MIN,
                        sql: '${TABLE}.email',
                        baseDimensionName: 'email',
                    },
                ],
            },
        ],
        [
            'adds a custom metric whose SQL names a hidden column',
            {
                additionalMetrics: [
                    {
                        name: 'sneaky',
                        table: 'customers',
                        type: MetricType.MIN,
                        sql: 'customers.EMAIL',
                    },
                ],
            },
        ],
        [
            'adds a custom SQL dimension',
            {
                customDimensions: [
                    {
                        id: 'custom',
                        name: 'custom',
                        table: 'customers',
                        type: CustomDimensionType.SQL,
                        sql: '${customers.name}',
                        dimensionType: DimensionType.STRING,
                    },
                ],
            },
        ],
        [
            'uses a hidden field in a table calculation',
            {
                tableCalculations: [
                    {
                        name: 'calc',
                        displayName: 'calc',
                        sql: 'LENGTH(${customers.email})',
                    },
                ],
            },
        ],
    ])('refuses a query that %s', (_, overrides) => {
        expect(metricQueryUsesAiHiddenData(explore, query(overrides))).toBe(
            true,
        );
    });

    it('allows a custom metric on a visible dimension', () => {
        expect(
            metricQueryUsesAiHiddenData(
                explore,
                query({
                    additionalMetrics: [
                        {
                            name: 'name_count',
                            table: 'customers',
                            type: MetricType.COUNT_DISTINCT,
                            sql: '${TABLE}.name',
                            baseDimensionName: 'name',
                        },
                    ],
                }),
            ),
        ).toBe(false);
    });

    it('refuses any query on an explore whose base model is hidden', () => {
        expect(
            metricQueryUsesAiHiddenData(
                buildExplore({ customersAiAccess: 'never' }),
                query(),
            ),
        ).toBe(true);
    });

    it('allows custom SQL dimensions on an explore with no rules', () => {
        const unmarked = buildExplore();
        unmarked.tables.customers.dimensions.email.aiAccess = undefined;

        expect(
            metricQueryUsesAiHiddenData(
                unmarked,
                query({
                    customDimensions: [
                        {
                            id: 'custom',
                            name: 'custom',
                            table: 'customers',
                            type: CustomDimensionType.SQL,
                            sql: 'customers.email',
                            dimensionType: DimensionType.STRING,
                        },
                    ],
                }),
            ),
        ).toBe(false);
    });
});
