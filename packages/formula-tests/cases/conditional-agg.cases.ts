import type { TestCase } from '../types';

// These test cases target P1 conditional aggregate functions that are NOT YET IMPLEMENTED.
// They are expected to fail with PARSE_ERROR until the formula agent adds support.
// Expected values are hand-computed from the test_orders seed data.

export const conditionalAggCases: TestCase[] = [
    {
        id: 'conditional-agg/sumif',
        formula: '=SUMIF(A, B = "Electronics")',
        description: 'Sum order_amount where category is Electronics',
        // Electronics rows: id 1 (100), 3 (75), 6 (180), 9 (310) = 665
        columns: { A: 'order_amount', B: 'category' },
        sourceTable: 'test_orders',
        expectedRows: [{ result: 665.00 }],
        warehouses: ['duckdb', 'postgres', 'bigquery', 'snowflake'],
        tier: 1,
        tags: ['aggregation', 'conditional', 'p1'],
    },
    {
        id: 'conditional-agg/countif',
        formula: '=COUNTIF(A > 100)',
        description: 'Count rows where order_amount > 100',
        // Rows > 100: 250.50, 500, 180, 420, 310, 150 = 6
        columns: { A: 'order_amount' },
        sourceTable: 'test_orders',
        expectedRows: [{ result: 6 }],
        warehouses: ['duckdb', 'postgres', 'bigquery', 'snowflake'],
        tier: 1,
        tags: ['aggregation', 'conditional', 'p1'],
    },
    {
        id: 'conditional-agg/averageif',
        formula: '=AVERAGEIF(A, B = "Clothing")',
        description: 'Average order_amount where category is Clothing',
        // Clothing rows: id 2 (250.50), 5 (30), 8 (60) = 340.50 / 3 = 113.50
        columns: { A: 'order_amount', B: 'category' },
        sourceTable: 'test_orders',
        expectedRows: [{ result: 113.50 }],
        warehouses: ['duckdb', 'postgres', 'bigquery', 'snowflake'],
        tier: 1,
        tags: ['aggregation', 'conditional', 'p1'],
    },
];
