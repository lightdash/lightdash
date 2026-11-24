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
    exploreHasExcludedTags,
    filterExploreByExcludedTags,
    getExcludedTagRules,
    getProjectExcludedTagRules,
    mergeExcludedTags,
    metricQueryUsesExcludedData,
} from './aiExcludedTags';

const EXCLUDED = ['pii'];

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
    customersTags,
    ordersTags,
}: {
    customersTags?: string[];
    ordersTags?: string[];
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
                tags: customersTags,
                dimensions: {
                    customer_id: dimension('customers', 'customer_id'),
                    email: dimension('customers', 'email', {
                        tags: ['pii', 'contact'],
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
                tags: ordersTags,
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

describe('getExcludedTagRules', () => {
    it('hides marked fields and fields built from them', () => {
        const { hiddenFieldIds } = getExcludedTagRules(
            buildExplore(),
            EXCLUDED,
        );

        expect([...hiddenFieldIds].sort()).toEqual([
            'customers_email',
            'customers_email_count',
            'customers_email_raw',
            'customers_email_upper',
        ]);
    });

    it('hides every field of a marked model and fields referencing it', () => {
        const explore = buildExplore({ ordersTags: ['pii'] });
        explore.tables.customers.metrics.order_total = metric(
            'customers',
            'order_total',
            { sql: 'SUM(${orders.total})', tablesReferences: ['orders'] },
        );
        const { hiddenFieldIds, hiddenTables } = getExcludedTagRules(
            explore,
            EXCLUDED,
        );

        expect([...hiddenTables]).toEqual(['orders']);
        expect(hiddenFieldIds.has('orders_order_id')).toBe(true);
        expect(hiddenFieldIds.has('orders_total')).toBe(true);
        expect(hiddenFieldIds.has('customers_order_total')).toBe(true);
        expect(hiddenFieldIds.has('customers_name')).toBe(false);
    });
});

describe('filterExploreByExcludedTags', () => {
    it('returns the explore unchanged when nothing is marked', () => {
        const explore = buildExplore();

        expect(exploreHasExcludedTags(explore, [])).toBe(false);
        expect(exploreHasExcludedTags(explore, ['finance'])).toBe(false);
        expect(filterExploreByExcludedTags(explore, ['finance'])).toBe(explore);
    });

    it('removes hidden fields and keeps the rest', () => {
        const filtered = filterExploreByExcludedTags(buildExplore(), EXCLUDED);

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
        const filtered = filterExploreByExcludedTags(
            buildExplore({ ordersTags: ['pii'] }),
            EXCLUDED,
        );

        expect(filtered!.tables.orders).toBeUndefined();
        expect(filtered!.joinedTables).toEqual([]);
    });

    it('drops the unfiltered copy of tables', () => {
        const explore = {
            ...buildExplore(),
            unfilteredTables: buildExplore().tables,
        };

        expect(
            filterExploreByExcludedTags(explore, EXCLUDED),
        ).not.toHaveProperty('unfilteredTables');
    });

    it('hides the whole explore when its base model is hidden', () => {
        expect(
            filterExploreByExcludedTags(
                buildExplore({ customersTags: ['pii'] }),
                EXCLUDED,
            ),
        ).toBeUndefined();
    });

    it('hides the whole explore when the explore itself has an excluded tag', () => {
        expect(
            filterExploreByExcludedTags(
                { ...buildExplore(), tags: ['pii'] },
                EXCLUDED,
            ),
        ).toBeUndefined();
    });
});

describe('metricQueryUsesExcludedData', () => {
    const explore = buildExplore();

    it('allows a query on visible fields', () => {
        expect(metricQueryUsesExcludedData(explore, query(), EXCLUDED)).toBe(
            false,
        );
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
        expect(
            metricQueryUsesExcludedData(explore, query(overrides), EXCLUDED),
        ).toBe(true);
    });

    it('allows a custom metric on a visible dimension', () => {
        expect(
            metricQueryUsesExcludedData(
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
                EXCLUDED,
            ),
        ).toBe(false);
    });

    it('refuses any query on an explore whose base model is hidden', () => {
        expect(
            metricQueryUsesExcludedData(
                buildExplore({ customersTags: ['pii'] }),
                query(),
                EXCLUDED,
            ),
        ).toBe(true);
    });

    it('allows custom SQL dimensions on an explore with no excluded data', () => {
        expect(
            metricQueryUsesExcludedData(
                buildExplore(),
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
                ['finance'],
            ),
        ).toBe(false);
    });
});

describe('getProjectExcludedTagRules', () => {
    it('combines the rules of every explore', () => {
        const rules = getProjectExcludedTagRules(
            [buildExplore({ ordersTags: ['pii'] })],
            EXCLUDED,
        );

        expect(rules.hiddenTables.has('orders')).toBe(true);
        expect(rules.hiddenFieldIds.has('customers_email')).toBe(true);
        expect(rules.hiddenFieldIds.has('customers_name')).toBe(false);
    });
});

describe('mergeExcludedTags', () => {
    it('joins lists, trims and drops blanks and duplicates', () => {
        expect(mergeExcludedTags(['pii', ' pii '], null, ['', 'hr'])).toEqual([
            'pii',
            'hr',
        ]);
    });
});

describe('deny tags on fields', () => {
    it('ignores tags that are not excluded', () => {
        const explore = buildExplore();

        expect(
            getExcludedTagRules(explore, ['contact']).hiddenFieldIds.has(
                'customers_email',
            ),
        ).toBe(true);
        expect(
            getExcludedTagRules(explore, ['finance']).hiddenFieldIds.size,
        ).toBe(0);
    });
});
