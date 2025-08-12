// Test script to reproduce the cross-table metric reference issue
// This script will help us understand the current behavior before implementing changes

const { MetricQueryBuilder } = require('./packages/backend/src/utils/QueryBuilder/MetricQueryBuilder.ts');

// Mock explore with customers and orders tables
const mockExplore = {
    name: 'customers',
    baseTable: 'customers',
    tables: {
        customers: {
            name: 'customers',
            sqlTable: 'customers',
            primaryKey: ['customer_id'],
            dimensions: {
                customer_id: {
                    name: 'customer_id',
                    table: 'customers',
                    type: 'string',
                    sql: '${customers.customer_id}',
                    compiledSql: 'customers.customer_id'
                }
            },
            metrics: {
                total_customers: {
                    name: 'total_customers',
                    table: 'customers',
                    type: 'count',
                    sql: '${customers.customer_id}',
                    compiledSql: 'COUNT(customers.customer_id)',
                    tablesReferences: ['customers']
                }
            }
        },
        orders: {
            name: 'orders',
            sqlTable: 'orders',
            primaryKey: ['order_id'],
            dimensions: {
                order_id: {
                    name: 'order_id',
                    table: 'orders',
                    type: 'string',
                    sql: '${orders.order_id}',
                    compiledSql: 'orders.order_id'
                }
            },
            metrics: {
                total_order_amount: {
                    name: 'total_order_amount',
                    table: 'orders',
                    type: 'sum',
                    sql: '${orders.amount}',
                    compiledSql: 'SUM(orders.amount)',
                    tablesReferences: ['orders']
                },
                revenue_per_customer: {
                    name: 'revenue_per_customer',
                    table: 'orders',
                    type: 'number',
                    sql: '${orders.total_order_amount} / ${customers.total_customers}',
                    compiledSql: 'SUM(orders.amount) / COUNT(customers.customer_id)',
                    tablesReferences: ['orders', 'customers']
                }
            }
        }
    },
    joinedTables: [
        {
            table: 'orders',
            sqlOn: '${customers.customer_id} = ${orders.customer_id}',
            relationship: 'one_to_many',
            tablesReferences: ['customers', 'orders']
        }
    ]
};

// Mock metric query with cross-table metric reference
const mockMetricQuery = {
    dimensions: [],
    metrics: ['orders_revenue_per_customer'],
    filters: {},
    sorts: [],
    limit: 100,
    tableCalculations: []
};

// Mock warehouse SQL builder
const mockWarehouseSqlBuilder = {
    getFieldQuoteChar: () => '"',
    getStringQuoteChar: () => "'",
    getEscapeStringQuoteChar: () => "''",
    getAdapterType: () => 'postgres'
};

console.log('Testing cross-table metric reference scenario...');
console.log('Explore:', JSON.stringify(mockExplore, null, 2));
console.log('Metric Query:', JSON.stringify(mockMetricQuery, null, 2));

// This would help us understand the current behavior
// We expect this to either fail or generate incorrect SQL
try {
    const builder = new MetricQueryBuilder({
        explore: mockExplore,
        compiledMetricQuery: mockMetricQuery,
        warehouseSqlBuilder: mockWarehouseSqlBuilder,
        intrinsicUserAttributes: {},
        userAttributes: {}
    });
    
    const result = builder.compileQuery(true); // Use experimental CTEs
    console.log('Generated SQL:', result.sql);
    console.log('Warnings:', result.warnings);
} catch (error) {
    console.log('Error occurred:', error.message);
}