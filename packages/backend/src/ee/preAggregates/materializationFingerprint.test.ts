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
import { computeMaterializationFingerprint } from './materializationFingerprint';

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
    metrics: ['order_count'],
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

describe('computeMaterializationFingerprint', () => {
    const baseline = fingerprintFor(getSourceExplore());

    test('is stable for identical input', () => {
        expect(fingerprintFor(getSourceExplore())).toBe(baseline);
        expect(baseline).toMatch(/^[0-9a-f]{64}$/);
    });

    test('ignores object key order', () => {
        const reordered = withExplore((explore) => {
            const { status, channel } = explore.tables.orders.dimensions;
            // eslint-disable-next-line no-param-reassign
            explore.tables.orders.dimensions = { channel, status };
        });
        expect(fingerprintFor(reordered)).toBe(baseline);
    });

    test('changes when a selected dimension is recompiled', () => {
        const changed = withExplore((explore) => {
            // eslint-disable-next-line no-param-reassign
            explore.tables.orders.dimensions.status.compiledSql =
                'LOWER("orders".status)';
        });
        expect(fingerprintFor(changed)).not.toBe(baseline);
    });

    test('changes when a selected metric is recompiled', () => {
        const changed = withExplore((explore) => {
            // eslint-disable-next-line no-param-reassign
            explore.tables.orders.metrics.order_count.compiledSql =
                'count(distinct "orders".id)';
        });
        expect(fingerprintFor(changed)).not.toBe(baseline);
    });

    test('changes when a definition filter target is recompiled', () => {
        const changed = withExplore((explore) => {
            // eslint-disable-next-line no-param-reassign
            explore.tables.orders.dimensions.channel.compiledSql =
                'COALESCE("orders".channel, \'web\')';
        });
        expect(fingerprintFor(changed)).not.toBe(baseline);
    });

    test('changes when the base table source or row filter changes', () => {
        const movedTable = withExplore((explore) => {
            // eslint-disable-next-line no-param-reassign
            explore.tables.orders.sqlTable = 'public.orders_v2';
        });
        const newWhere = withExplore((explore) => {
            // eslint-disable-next-line no-param-reassign
            explore.tables.orders.sqlWhere = '"orders".is_test = false';
        });
        expect(fingerprintFor(movedTable)).not.toBe(baseline);
        expect(fingerprintFor(newWhere)).not.toBe(baseline);
    });

    test('changes when a join the pre-aggregate reads changes', () => {
        const changed = withExplore((explore) => {
            // eslint-disable-next-line no-param-reassign
            explore.joinedTables[0].compiledSqlOn =
                '"orders".customer_uuid = "customers".customer_uuid';
        });
        expect(fingerprintFor(changed)).not.toBe(baseline);
    });

    test('changes when the definition changes', () => {
        expect(
            fingerprintFor(getSourceExplore(), {
                ...preAggregateDef,
                metrics: ['order_count', 'refund_total'],
            }),
        ).not.toBe(baseline);
    });

    test('ignores refresh settings', () => {
        expect(
            fingerprintFor(getSourceExplore(), {
                ...preAggregateDef,
                refresh: { cron: '0 3 * * *', onCompile: false },
            }),
        ).toBe(baseline);
    });

    test('ignores fields and joins the pre-aggregate does not read', () => {
        const unrelated = withExplore((explore) => {
            // eslint-disable-next-line no-param-reassign
            explore.tables.orders.metrics.refund_total.compiledSql =
                'SUM("orders".refund_amount)';
            // eslint-disable-next-line no-param-reassign
            explore.tables.warehouses.sqlTable = 'public.warehouses_v2';
            // eslint-disable-next-line no-param-reassign
            explore.joinedTables[1].compiledSqlOn =
                '"orders".wh_id = "warehouses".id';
            // eslint-disable-next-line no-param-reassign
            explore.tables.orders.dimensions.status.label = 'Order status';
        });
        expect(fingerprintFor(unrelated)).toBe(baseline);
    });
});
