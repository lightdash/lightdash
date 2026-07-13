import {
    DimensionType,
    JoinRelationship,
    MetricType,
    SupportedDbtAdapter,
    type InferredRelationship,
    type ProfiledTable,
    type ProfileResult,
} from '@lightdash/common';
import { generateSemanticLayer } from './semanticGeneration';

const options = {
    targetDatabase: SupportedDbtAdapter.POSTGRES,
    fieldQuoteChar: '"',
    startOfWeek: null,
};

const table = (
    name: string,
    rowCount: number | null,
    columns: ProfiledTable['columns'],
): ProfiledTable => ({
    database: 'analytics',
    schema: 'public',
    name,
    tableType: 'table',
    rowCount,
    columns,
});

const profile = (
    tables: ProfiledTable[],
    relationships: InferredRelationship[] = [],
    primaryKeys: Record<string, string | null> = {},
): ProfileResult => ({
    tables,
    entities: tables.map((profiledTable) => ({
        database: profiledTable.database,
        schema: profiledTable.schema,
        tableName: profiledTable.name,
        label: profiledTable.name,
        description: profiledTable.name,
        rowCount: profiledTable.rowCount,
        columnCount: profiledTable.columns.length,
        primaryKey: primaryKeys[profiledTable.name] ?? null,
        notes: [],
    })),
    relationships,
    truncated: false,
    profiledAt: '2026-07-13T12:00:00.000Z',
});

const orders = table('orders', 1_000, [
    { name: 'order_id', type: DimensionType.NUMBER },
    { name: 'customer_id', type: DimensionType.NUMBER },
    { name: 'created_at', type: DimensionType.TIMESTAMP },
    { name: 'revenue', type: DimensionType.NUMBER },
    { name: 'status', type: DimensionType.STRING },
]);
const customers = table('customers', 100, [
    { name: 'customer_id', type: DimensionType.NUMBER },
    { name: 'name', type: DimensionType.STRING },
]);
const products = table('products', 50, [
    { name: 'product_id', type: DimensionType.NUMBER },
    { name: 'name', type: DimensionType.STRING },
]);
const ordersToCustomers: InferredRelationship = {
    fromTable: 'orders',
    fromColumn: 'customer_id',
    toTable: 'customers',
    toColumn: 'customer_id',
    type: 'many_to_one',
    confidence: 'high',
};

describe('generateSemanticLayer', () => {
    it('selects the largest date-and-money entity and its high-confidence neighbors', () => {
        const invoices = table('invoices', 500, [
            { name: 'invoice_date', type: DimensionType.DATE },
            { name: 'total_value', type: DimensionType.NUMBER },
        ]);
        const result = generateSemanticLayer(
            profile(
                [customers, invoices, orders, products],
                [
                    ordersToCustomers,
                    {
                        fromTable: 'orders',
                        fromColumn: 'product_id',
                        toTable: 'products',
                        toColumn: 'product_id',
                        type: 'many_to_one',
                        confidence: 'low',
                    },
                ],
                { orders: 'order_id', customers: 'customer_id' },
            ),
            options,
        );

        expect(result.explores.map(({ name }) => name)).toEqual([
            'orders',
            'customers',
        ]);
        expect(result.skippedTableCount).toBe(2);
        expect(result.explores[0].joinedTables).toEqual([
            expect.objectContaining({
                table: 'customers',
                sqlOn: '${orders.customer_id} = ${customers.customer_id}',
                relationship: JoinRelationship.MANY_TO_ONE,
            }),
        ]);
        expect(result.explores[1].joinedTables).toEqual([
            expect.objectContaining({
                table: 'orders',
                relationship: JoinRelationship.ONE_TO_MANY,
            }),
        ]);
    });

    it('falls back to the most-referenced table when no date-and-money entity exists', () => {
        const orderHeaders = table('order_headers', 1_000, [
            { name: 'order_id', type: DimensionType.NUMBER },
            { name: 'customer_id', type: DimensionType.NUMBER },
        ]);
        const lineItems = table('line_items', 2_000, [
            { name: 'order_id', type: DimensionType.NUMBER },
        ]);
        const result = generateSemanticLayer(
            profile(
                [customers, orderHeaders, lineItems],
                [
                    {
                        fromTable: 'order_headers',
                        fromColumn: 'customer_id',
                        toTable: 'customers',
                        toColumn: 'customer_id',
                        type: 'many_to_one',
                        confidence: 'high',
                    },
                    {
                        fromTable: 'line_items',
                        fromColumn: 'order_id',
                        toTable: 'order_headers',
                        toColumn: 'order_id',
                        type: 'many_to_one',
                        confidence: 'high',
                    },
                ],
            ),
            options,
        );

        expect(result.explores[0].name).toBe('order_headers');
        expect(result.explores).toHaveLength(3);
    });

    it('falls back to the largest table when there are no relationships', () => {
        const result = generateSemanticLayer(
            profile([
                table('small', null, [
                    { name: 'name', type: DimensionType.STRING },
                ]),
                table('largest', 500, [
                    { name: 'name', type: DimensionType.STRING },
                ]),
                table('medium', 100, [
                    { name: 'name', type: DimensionType.STRING },
                ]),
            ]),
            options,
        );

        expect(result.explores.map(({ name }) => name)).toEqual(['largest']);
        expect(result.skippedTableCount).toBe(2);
    });

    it('uses the first table when all row counts are null', () => {
        const result = generateSemanticLayer(
            profile([
                table('first_table', null, [
                    { name: 'name', type: DimensionType.STRING },
                ]),
                table('second_table', null, [
                    { name: 'name', type: DimensionType.STRING },
                ]),
            ]),
            options,
        );

        expect(result.explores[0].name).toBe('first_table');
    });

    it('generates compiler-owned count, money, and identifier metrics', () => {
        const result = generateSemanticLayer(
            profile([orders, customers], [ordersToCustomers], {
                orders: 'order_id',
                customers: 'customer_id',
            }),
            options,
        );
        const { metrics } = result.tables.orders;

        expect(metrics.orders_count).toMatchObject({
            type: MetricType.COUNT,
            sql: '${orders.order_id}',
            label: 'Orders count',
        });
        expect(metrics.total_revenue).toMatchObject({
            type: MetricType.SUM,
            sql: '${orders.revenue}',
            label: 'Total revenue',
        });
        expect(metrics.avg_revenue).toMatchObject({
            type: MetricType.AVERAGE,
            sql: '${orders.revenue}',
            label: 'Avg revenue',
        });
        expect(metrics.unique_order_id).toMatchObject({
            type: MetricType.COUNT_DISTINCT,
            label: 'Unique order id',
        });
        expect(metrics.unique_customer_id).toBeUndefined();
    });

    it('adds the native default time intervals and quotes physical identifiers', () => {
        const result = generateSemanticLayer(
            profile([orders], [], { orders: 'order_id' }),
            options,
        );

        expect(result.tables.orders.sqlTable).toBe(
            '"analytics"."public"."orders"',
        );
        expect(result.tables.orders.dimensions.created_at.sql).toBe(
            '${TABLE}."created_at"',
        );
        expect(
            Object.keys(result.tables.orders.dimensions).filter((name) =>
                name.startsWith('created_at_'),
            ),
        ).toEqual([
            'created_at_raw',
            'created_at_day',
            'created_at_week',
            'created_at_month',
            'created_at_quarter',
            'created_at_year',
        ]);
    });

    it('produces count-only metrics for an all-string table without identifiers', () => {
        const events = table('events', 10, [
            { name: 'name', type: DimensionType.STRING },
            { name: 'category', type: DimensionType.STRING },
        ]);
        const result = generateSemanticLayer(profile([events]), options);

        expect(Object.values(result.tables.events.metrics)).toEqual([
            expect.objectContaining({
                name: 'events_count',
                type: MetricType.COUNT,
            }),
        ]);
        expect(result.explores).toHaveLength(1);
        expect(result.explores[0].joinedTables).toEqual([]);
    });

    it('limits a relationship-heavy profile to six explores', () => {
        const satellites = Array.from({ length: 8 }, (_, index) =>
            table(`satellite_${index}`, 10, [
                { name: 'id', type: DimensionType.NUMBER },
            ]),
        );
        const relationships: InferredRelationship[] = satellites.map(
            (satellite) => ({
                fromTable: 'orders',
                fromColumn: 'order_id',
                toTable: satellite.name,
                toColumn: 'id',
                type: 'many_to_one',
                confidence: 'high',
            }),
        );
        const result = generateSemanticLayer(
            profile([orders, ...satellites], relationships),
            options,
        );

        expect(result.explores).toHaveLength(6);
        expect(result.skippedTableCount).toBe(3);
    });
});
