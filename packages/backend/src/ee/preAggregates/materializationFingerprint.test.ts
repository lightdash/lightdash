/* oxlint-disable no-param-reassign -- fixtures are mutated in place on purpose */
import {
    DimensionType,
    FieldType,
    FilterOperator,
    MetricType,
    preAggregateMaterialization,
    SupportedDbtAdapter,
    type Explore,
    type PreAggregateDef,
} from '@lightdash/common';
import {
    computeMaterializationFingerprint,
    normalizeSql,
} from './materializationFingerprint';

const getSourceExplore = (): Explore =>
    ({
        name: 'orders',
        label: 'Orders',
        tags: [],
        baseTable: 'orders',
        joinedTables: [
            {
                table: 'customers',
                sqlOn: '${orders.customer_id} = ${customers.customer_id}',
                compiledSqlOn: '"orders".customer_id = "customers".customer_id',
                tablesReferences: ['orders', 'customers'],
            },
            {
                table: 'warehouses',
                sqlOn: '${orders.warehouse_id} = ${warehouses.id}',
                compiledSqlOn: '"orders".warehouse_id = "warehouses".id',
                tablesReferences: ['orders', 'warehouses'],
            },
        ],
        targetDatabase: SupportedDbtAdapter.POSTGRES,
        tables: {
            orders: {
                name: 'orders',
                label: 'Orders',
                database: 'analytics',
                schema: 'public',
                sqlTable: 'public.orders',
                sqlWhere: '"orders".deleted_at IS NULL',
                dimensions: {
                    status: {
                        fieldType: FieldType.DIMENSION,
                        type: DimensionType.STRING,
                        name: 'status',
                        label: 'Status',
                        description: 'Order status',
                        table: 'orders',
                        tableLabel: 'Orders',
                        sql: '${TABLE}.status',
                        hidden: false,
                        compiledSql: '"orders".status',
                        tablesReferences: ['orders'],
                    },
                    channel: {
                        fieldType: FieldType.DIMENSION,
                        type: DimensionType.STRING,
                        name: 'channel',
                        label: 'Channel',
                        table: 'orders',
                        tableLabel: 'Orders',
                        sql: '${TABLE}.channel',
                        hidden: false,
                        compiledSql: '"orders".channel',
                        tablesReferences: ['orders'],
                    },
                },
                metrics: {
                    order_count: {
                        fieldType: FieldType.METRIC,
                        type: MetricType.COUNT,
                        name: 'order_count',
                        label: 'Order count',
                        table: 'orders',
                        tableLabel: 'Orders',
                        sql: 'count(*)',
                        hidden: false,
                        compiledSql: 'count(*)',
                        tablesReferences: ['orders'],
                        format: 'usd',
                        round: 2,
                    },
                    refund_total: {
                        fieldType: FieldType.METRIC,
                        type: MetricType.SUM,
                        name: 'refund_total',
                        label: 'Refund total',
                        table: 'orders',
                        tableLabel: 'Orders',
                        sql: '${TABLE}.refund',
                        hidden: false,
                        compiledSql: 'SUM("orders".refund)',
                        tablesReferences: ['orders'],
                    },
                    paid_count: {
                        fieldType: FieldType.METRIC,
                        type: MetricType.COUNT,
                        name: 'paid_count',
                        label: 'Paid count',
                        table: 'orders',
                        tableLabel: 'Orders',
                        sql: '${TABLE}.id',
                        hidden: false,
                        compiledSql:
                            'COUNT(CASE WHEN ("orders".status) = (\'paid\') THEN ("orders".id) ELSE NULL END)',
                        tablesReferences: ['orders'],
                        filters: [
                            {
                                id: 'compile-time-uuid-1',
                                target: { fieldRef: 'orders.status' },
                                operator: FilterOperator.EQUALS,
                                values: ['paid'],
                            },
                        ],
                    },
                },
                lineageGraph: {},
            },
            customers: {
                name: 'customers',
                label: 'Customers',
                database: 'analytics',
                schema: 'public',
                sqlTable: 'public.customers',
                dimensions: {
                    country: {
                        fieldType: FieldType.DIMENSION,
                        type: DimensionType.STRING,
                        name: 'country',
                        label: 'Country',
                        table: 'customers',
                        tableLabel: 'Customers',
                        sql: '${TABLE}.country',
                        hidden: false,
                        compiledSql: '"customers".country',
                        tablesReferences: ['customers'],
                    },
                },
                metrics: {},
                lineageGraph: {},
            },
            warehouses: {
                name: 'warehouses',
                label: 'Warehouses',
                database: 'analytics',
                schema: 'public',
                sqlTable: 'public.warehouses',
                dimensions: {
                    region: {
                        fieldType: FieldType.DIMENSION,
                        type: DimensionType.STRING,
                        name: 'region',
                        label: 'Region',
                        table: 'warehouses',
                        tableLabel: 'Warehouses',
                        sql: '${TABLE}.region',
                        hidden: false,
                        compiledSql: '"warehouses".region',
                        tablesReferences: ['warehouses'],
                    },
                },
                metrics: {},
                lineageGraph: {},
            },
        },
    }) as unknown as Explore;

const preAggregateDef: PreAggregateDef = {
    name: 'by_country',
    dimensions: ['status', 'customers.country'],
    metrics: ['order_count', 'paid_count'],
    filters: [
        {
            id: 'paid-only',
            target: { fieldRef: 'orders.channel' },
            operator: FilterOperator.EQUALS,
            values: ['web'],
        },
    ],
};

const fingerprintFor = (
    sourceExplore: Explore,
    def: PreAggregateDef = preAggregateDef,
) =>
    computeMaterializationFingerprint({
        sourceExplore,
        preAggregateDef: def,
        materializationMetricQuery:
            preAggregateMaterialization.buildMaterializationMetricQuery({
                sourceExplore,
                preAggregateDef: def,
                materializationConfig: { maxRows: null },
            }),
    });

const withExplore = (mutate: (explore: Explore) => void): Explore => {
    const explore = getSourceExplore();
    mutate(explore);
    return explore;
};

// Re-parses the explore with every object's keys in reverse order, as a
// YAML file submitted with keys shuffled would arrive
const reverseKeys = <T>(value: T): T => {
    if (Array.isArray(value)) return value.map(reverseKeys) as T;
    if (value && typeof value === 'object') {
        return Object.keys(value as Record<string, unknown>)
            .reverse()
            .reduce<Record<string, unknown>>((acc, key) => {
                acc[key] = reverseKeys((value as Record<string, unknown>)[key]);
                return acc;
            }, {}) as T;
    }
    return value;
};

describe('normalizeSql', () => {
    test('collapses whitespace and comments outside quotes', () => {
        expect(
            normalizeSql(
                '  SUM(\n   "orders".amount -- the gross\n ) /* x */ ',
            ),
        ).toBe('SUM("orders".amount)');
        expect(normalizeSql('a - -b')).toBe('a - -b');
        expect(normalizeSql('count( * )')).toBe('count(*)');
        expect(normalizeSql("'a  b' || 'c'")).toBe("'a  b' || 'c'");
        expect(normalizeSql("'it''s  here'")).toBe("'it''s  here'");
        expect(normalizeSql('"my  col" + 1')).toBe('"my  col" + 1');
        expect(normalizeSql("'-- not a comment'")).toBe("'-- not a comment'");
    });
});

describe('computeMaterializationFingerprint', () => {
    const baseline = fingerprintFor(getSourceExplore());

    test('is stable for identical input', () => {
        expect(fingerprintFor(getSourceExplore())).toBe(baseline);
        expect(baseline).toMatch(/^[0-9a-f]{64}$/);
    });

    describe('does not move for changes that leave the rows alone', () => {
        test('object key order anywhere in the explore or definition', () => {
            expect(
                fingerprintFor(
                    reverseKeys(getSourceExplore()),
                    reverseKeys(preAggregateDef),
                ),
            ).toBe(baseline);
        });

        test('order of the dimension and metric lists', () => {
            expect(
                fingerprintFor(getSourceExplore(), {
                    ...preAggregateDef,
                    dimensions: ['customers.country', 'status'],
                    metrics: ['paid_count', 'order_count'],
                }),
            ).toBe(baseline);
        });

        test('labels, descriptions, formats and other presentation', () => {
            const presentation = withExplore((explore) => {
                const { status } = explore.tables.orders.dimensions;
                const { order_count: orderCount } =
                    explore.tables.orders.metrics;
                status.label = 'Order status';
                status.description = 'Where the order is in its life';
                orderCount.format = 'eur';
                orderCount.round = 0;
                orderCount.hidden = true;
                explore.label = 'Orders (renamed)';
                explore.tables.orders.label = 'All orders';
            });
            expect(fingerprintFor(presentation)).toBe(baseline);
        });

        test('whitespace and comments in compiled sql', () => {
            const reformatted = withExplore((explore) => {
                explore.tables.orders.dimensions.status.compiledSql =
                    '  "orders".status  -- the status\n';
                explore.tables.orders.metrics.order_count.compiledSql =
                    'count(\n  *\n)';
                explore.joinedTables[0].compiledSqlOn =
                    '"orders".customer_id   =   "customers".customer_id';
                explore.tables.orders.sqlWhere =
                    '/* soft delete */ "orders".deleted_at IS NULL';
            });
            expect(fingerprintFor(reformatted)).toBe(baseline);
        });

        test('filter rule ids, which are minted on every compile', () => {
            const recompiled = withExplore((explore) => {
                explore.tables.orders.metrics.paid_count.filters![0].id =
                    'compile-time-uuid-2';
            });
            expect(fingerprintFor(recompiled)).toBe(baseline);
            expect(
                fingerprintFor(getSourceExplore(), {
                    ...preAggregateDef,
                    filters: preAggregateDef.filters!.map((filter) => ({
                        ...filter,
                        id: 'another-id',
                    })),
                }),
            ).toBe(baseline);
        });

        test('sorts, the pre-aggregate name and refresh settings', () => {
            expect(
                fingerprintFor(getSourceExplore(), {
                    ...preAggregateDef,
                    name: 'by_country_v2',
                    sorts: [{ fieldId: 'orders_status', descending: true }],
                    refresh: { cron: '0 3 * * *', onChange: true },
                }),
            ).toBe(baseline);
        });

        test('fields and joins the pre-aggregate does not read', () => {
            const unrelated = withExplore((explore) => {
                explore.tables.orders.metrics.refund_total.compiledSql =
                    'SUM("orders".refund_amount)';
                explore.tables.warehouses.sqlTable = 'public.warehouses_v2';
                explore.joinedTables[1].compiledSqlOn =
                    '"orders".wh_id = "warehouses".id';
            });
            expect(fingerprintFor(unrelated)).toBe(baseline);
        });
    });

    describe('moves for changes that alter the rows', () => {
        test('a selected dimension is recompiled', () => {
            const changed = withExplore((explore) => {
                explore.tables.orders.dimensions.status.compiledSql =
                    'LOWER("orders".status)';
            });
            expect(fingerprintFor(changed)).not.toBe(baseline);
        });

        test('a selected metric is recompiled or changes type', () => {
            const recompiled = withExplore((explore) => {
                explore.tables.orders.metrics.order_count.compiledSql =
                    'count(distinct "orders".id)';
            });
            const retyped = withExplore((explore) => {
                explore.tables.orders.metrics.order_count.type =
                    MetricType.COUNT_DISTINCT;
            });
            expect(fingerprintFor(recompiled)).not.toBe(baseline);
            expect(fingerprintFor(retyped)).not.toBe(baseline);
        });

        test('a metric filter or definition filter changes', () => {
            const metricFilter = withExplore((explore) => {
                explore.tables.orders.metrics.paid_count.filters![0].values = [
                    'shipped',
                ];
            });
            expect(fingerprintFor(metricFilter)).not.toBe(baseline);
            expect(
                fingerprintFor(getSourceExplore(), {
                    ...preAggregateDef,
                    filters: [
                        {
                            ...preAggregateDef.filters![0],
                            values: ['mobile'],
                        },
                    ],
                }),
            ).not.toBe(baseline);
        });

        test('a definition filter target is recompiled', () => {
            const changed = withExplore((explore) => {
                explore.tables.orders.dimensions.channel.compiledSql =
                    'COALESCE("orders".channel, \'web\')';
            });
            expect(fingerprintFor(changed)).not.toBe(baseline);
        });

        test('the base table source or row filter changes', () => {
            const movedTable = withExplore((explore) => {
                explore.tables.orders.sqlTable = 'public.orders_v2';
            });
            const newWhere = withExplore((explore) => {
                Object.assign(explore.tables.orders, {
                    sqlWhere: '"orders".is_test = false',
                });
            });
            expect(fingerprintFor(movedTable)).not.toBe(baseline);
            expect(fingerprintFor(newWhere)).not.toBe(baseline);
        });

        test('a join the pre-aggregate reads changes', () => {
            const changed = withExplore((explore) => {
                Object.assign(explore.joinedTables[0], {
                    compiledSqlOn:
                        '"orders".customer_uuid = "customers".customer_uuid',
                });
            });
            expect(fingerprintFor(changed)).not.toBe(baseline);
        });

        test('the selected fields, row cap or role change', () => {
            expect(
                fingerprintFor(getSourceExplore(), {
                    ...preAggregateDef,
                    metrics: ['order_count', 'paid_count', 'refund_total'],
                }),
            ).not.toBe(baseline);
            expect(
                fingerprintFor(getSourceExplore(), {
                    ...preAggregateDef,
                    maxRows: 1000,
                }),
            ).not.toBe(baseline);
            expect(
                fingerprintFor(getSourceExplore(), {
                    ...preAggregateDef,
                    materializationRole: {
                        email: 'analyst@example.com',
                        attributes: { region: ['EMEA'] },
                    },
                }),
            ).not.toBe(baseline);
        });
    });
});
