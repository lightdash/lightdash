import {
    DimensionType,
    FieldType,
    MetricType,
    type CompiledExploreJoin,
    type CompiledTable,
    type Dimension,
    type Explore,
    type ItemsMap,
    type Metric,
    type TableCalculation,
} from '@lightdash/common';
import { getUnderlyingDataAvailableTables } from './getUnderlyingDataAvailableTables';

const join = (table: string): CompiledExploreJoin => ({
    table,
    sqlOn: `\${customers.customer_id} = \${${table}.customer_id}`,
    compiledSqlOn: `("customers".customer_id) = ("${table}".customer_id)`,
});

const table = (
    name: string,
    nestedFrom?: CompiledTable['nestedFrom'],
): CompiledTable => ({
    name,
    label: name,
    database: 'db',
    schema: 'schema',
    sqlTable: `"${name}"`,
    dimensions: {},
    metrics: {},
    lineageGraph: {},
    ...(nestedFrom ? { nestedFrom } : {}),
});

const customersExplore: Pick<Explore, 'baseTable' | 'joinedTables' | 'tables'> =
    {
        baseTable: 'customers',
        joinedTables: [join('orders'), join('payments')],
        tables: {
            customers: table('customers'),
            orders: table('orders'),
            payments: table('payments'),
        },
    };

const nestedExplore: Pick<Explore, 'baseTable' | 'joinedTables' | 'tables'> = {
    baseTable: 'orders',
    joinedTables: [
        join('customers'),
        join('orders__line_items'),
        join('orders__line_items__discounts'),
        join('orders__tags'),
    ],
    tables: {
        orders: table('orders'),
        customers: table('customers'),
        orders__line_items: table('orders__line_items', {
            parentTable: 'orders',
            columnPath: 'line_items',
        }),
        orders__line_items__discounts: table('orders__line_items__discounts', {
            parentTable: 'orders__line_items',
            columnPath: 'discounts',
        }),
        orders__tags: table('orders__tags', {
            parentTable: 'orders',
            columnPath: 'tags',
        }),
    },
};

const discountCode: Dimension = {
    fieldType: FieldType.DIMENSION,
    type: DimensionType.STRING,
    name: 'code',
    label: 'Code',
    table: 'orders__line_items__discounts',
    tableLabel: 'Orders: Line items: Discounts',
    sql: '${TABLE}.code',
    hidden: false,
};

const ordersFulfillmentRate: Metric = {
    fieldType: FieldType.METRIC,
    type: MetricType.AVERAGE,
    name: 'fulfillment_rate',
    label: 'Fulfillment rate',
    table: 'orders',
    tableLabel: 'Orders',
    sql: 'CASE WHEN ${TABLE}.is_completed THEN 1 ELSE 0 END',
    hidden: false,
    showUnderlyingValues: ['status', 'customers.first_name'],
};

const regionDimension: Dimension = {
    fieldType: FieldType.DIMENSION,
    type: DimensionType.STRING,
    name: 'region',
    label: 'Region',
    table: 'regions',
    tableLabel: 'Regions',
    sql: '${TABLE}.region',
    hidden: false,
};

const rowNumber: TableCalculation = {
    name: 'row_number',
    displayName: 'Row number',
    sql: 'ROW_NUMBER() OVER ()',
};

describe('getUnderlyingDataAvailableTables', () => {
    it('includes the base table when no queried field belongs to it', () => {
        const fields: ItemsMap = {
            orders_fulfillment_rate: ordersFulfillmentRate,
        };

        const tables = getUnderlyingDataAvailableTables(
            customersExplore,
            fields,
        );

        expect(tables.has('customers')).toBe(true);
    });

    it('includes every joined table, queried or not', () => {
        const fields: ItemsMap = {
            orders_fulfillment_rate: ordersFulfillmentRate,
        };

        const tables = getUnderlyingDataAvailableTables(
            customersExplore,
            fields,
        );

        expect(tables.has('orders')).toBe(true);
        expect(tables.has('payments')).toBe(true);
    });

    it('includes the table of a queried field outside the explore joins', () => {
        const fields: ItemsMap = {
            orders_fulfillment_rate: ordersFulfillmentRate,
            regions_region: regionDimension,
        };

        const tables = getUnderlyingDataAvailableTables(
            customersExplore,
            fields,
        );

        expect(tables.has('regions')).toBe(true);
    });

    it('ignores items that are not fields', () => {
        const fields: ItemsMap = { row_number: rowNumber };

        const tables = getUnderlyingDataAvailableTables(
            customersExplore,
            fields,
        );

        expect([...tables]).toEqual(['customers', 'orders', 'payments']);
    });

    it('leaves out unnested virtual tables the source query did not reach', () => {
        const fields: ItemsMap = {
            orders_fulfillment_rate: ordersFulfillmentRate,
        };

        const tables = getUnderlyingDataAvailableTables(nestedExplore, fields);

        expect([...tables]).toEqual(['orders', 'customers']);
    });

    it('includes a queried unnested table and its unnested ancestors', () => {
        const fields: ItemsMap = {
            orders__line_items__discounts_code: discountCode,
        };

        const tables = getUnderlyingDataAvailableTables(nestedExplore, fields);

        expect(tables.has('orders__line_items__discounts')).toBe(true);
        expect(tables.has('orders__line_items')).toBe(true);
        expect(tables.has('orders__tags')).toBe(false);
    });
});
