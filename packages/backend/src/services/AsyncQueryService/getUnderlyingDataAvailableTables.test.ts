import {
    DimensionType,
    FieldType,
    MetricType,
    type CompiledExploreJoin,
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

const customersExplore: Pick<Explore, 'baseTable' | 'joinedTables'> = {
    baseTable: 'customers',
    joinedTables: [join('orders'), join('payments')],
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
});
