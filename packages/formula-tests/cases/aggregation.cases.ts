import { ALL_WAREHOUSES } from '../config';
import type { TestCase } from '../types';

export const aggregationCases: TestCase[] = [
    {
        id: 'aggregation/sum',
        formula: '=SUM(A)',
        description: 'SUM aggregate over all rows',
        columns: { A: 'order_amount' },
        sourceTable: 'test_orders',
        expectedRows: [{ result: 2075.50 }],
        warehouses: ALL_WAREHOUSES,
        tier: 1,
        tags: ['aggregation'],
    },
    {
        id: 'aggregation/avg',
        formula: '=AVG(A)',
        description: 'AVG aggregate over all rows',
        columns: { A: 'order_amount' },
        sourceTable: 'test_orders',
        expectedRows: [{ result: 207.55 }],
        warehouses: ALL_WAREHOUSES,
        tier: 1,
        tags: ['aggregation'],
    },
    {
        id: 'aggregation/count-column',
        formula: '=COUNT(A)',
        description: 'COUNT of non-null values in column',
        columns: { A: 'order_amount' },
        sourceTable: 'test_orders',
        expectedRows: [{ result: 10 }],
        warehouses: ALL_WAREHOUSES,
        tier: 1,
        tags: ['aggregation'],
    },
    {
        id: 'aggregation/count-all',
        formula: '=COUNT()',
        description: 'COUNT all rows',
        columns: {},
        sourceTable: 'test_orders',
        expectedRows: [{ result: 10 }],
        warehouses: ALL_WAREHOUSES,
        tier: 1,
        tags: ['aggregation'],
    },
    {
        id: 'aggregation/count-distinct-low-cardinality',
        formula: '=COUNT(DISTINCT A)',
        description: 'COUNT(DISTINCT) over a low-cardinality column',
        columns: { A: 'category' },
        sourceTable: 'test_orders',
        expectedRows: [{ result: 3 }],
        warehouses: ALL_WAREHOUSES,
        tier: 1,
        tags: ['aggregation'],
    },
    {
        id: 'aggregation/count-distinct-numeric',
        formula: '=COUNT(DISTINCT A)',
        description: 'COUNT(DISTINCT) over a numeric column with duplicates',
        columns: { A: 'quantity' },
        sourceTable: 'test_orders',
        expectedRows: [{ result: 5 }],
        warehouses: ALL_WAREHOUSES,
        tier: 1,
        tags: ['aggregation'],
    },
    {
        id: 'aggregation/count-distinct-all-unique',
        formula: '=COUNT(DISTINCT A)',
        description: 'COUNT(DISTINCT) on a unique column equals row count',
        columns: { A: 'customer_name' },
        sourceTable: 'test_orders',
        expectedRows: [{ result: 10 }],
        warehouses: ALL_WAREHOUSES,
        tier: 1,
        tags: ['aggregation'],
    },
    {
        id: 'aggregation/min',
        formula: '=MIN(A)',
        description: 'MIN aggregate (single argument)',
        columns: { A: 'order_amount' },
        sourceTable: 'test_orders',
        expectedRows: [{ result: 30.00 }],
        warehouses: ALL_WAREHOUSES,
        tier: 1,
        tags: ['aggregation'],
    },
    {
        id: 'aggregation/max',
        formula: '=MAX(A)',
        description: 'MAX aggregate (single argument)',
        columns: { A: 'order_amount' },
        sourceTable: 'test_orders',
        expectedRows: [{ result: 500.00 }],
        warehouses: ALL_WAREHOUSES,
        tier: 1,
        tags: ['aggregation'],
    },
    {
        id: 'aggregation/sum-with-nulls',
        formula: '=SUM(A)',
        description: 'SUM skips NULL values (10 + 30 + 50 = 90)',
        columns: { A: 'val_a' },
        sourceTable: 'test_nulls',
        expectedRows: [{ result: 90.00 }],
        warehouses: ALL_WAREHOUSES,
        tier: 1,
        tags: ['aggregation', 'null'],
    },
    {
        id: 'aggregation/avg-with-nulls',
        formula: '=AVG(A)',
        description: 'AVG skips NULL values (90 / 3 = 30)',
        columns: { A: 'val_a' },
        sourceTable: 'test_nulls',
        expectedRows: [{ result: 30.00 }],
        warehouses: ALL_WAREHOUSES,
        tier: 1,
        tags: ['aggregation', 'null'],
    },
    {
        id: 'aggregation/count-with-nulls',
        formula: '=COUNT(A)',
        description: 'COUNT skips NULL values (3 non-null out of 5)',
        columns: { A: 'val_a' },
        sourceTable: 'test_nulls',
        expectedRows: [{ result: 3 }],
        warehouses: ALL_WAREHOUSES,
        tier: 1,
        tags: ['aggregation', 'null'],
    },
    {
        id: 'aggregation/count-all-with-nulls',
        formula: '=COUNT()',
        description: 'COUNT() counts all rows including those with NULLs',
        columns: {},
        sourceTable: 'test_nulls',
        expectedRows: [{ result: 5 }],
        warehouses: ALL_WAREHOUSES,
        tier: 1,
        tags: ['aggregation', 'null'],
    },
    {
        id: 'aggregation/sum-expression',
        formula: '=SUM(A) + SUM(B)',
        description: 'Arithmetic on aggregate results',
        columns: { A: 'order_amount', B: 'tax' },
        sourceTable: 'test_orders',
        expectedRows: [{ result: 2283.05 }],
        warehouses: ALL_WAREHOUSES,
        tier: 1,
        tags: ['aggregation', 'arithmetic'],
    },
    {
        id: 'aggregation/avg-vs-sum-count',
        formula: '=SUM(A) / COUNT(A)',
        description: 'Manual average via SUM/COUNT matches AVG behavior',
        columns: { A: 'order_amount' },
        sourceTable: 'test_orders',
        expectedRows: [{ result: 207.55 }],
        warehouses: ALL_WAREHOUSES,
        tier: 1,
        tags: ['aggregation'],
    },
    {
        id: 'aggregation/sum-over-partition-by',
        formula: '=SUM(A) OVER (PARTITION BY B)',
        description:
            'Per-partition windowed SUM — total per category replicated on every row',
        columns: { A: 'order_amount', B: 'category' },
        sourceTable: 'test_orders',
        orderBy: 'id',
        expectedRows: [
            { result: 665 }, // id=1, Electronics
            { result: 340.5 }, // id=2, Clothing
            { result: 665 }, // id=3, Electronics
            { result: 1070 }, // id=4, Furniture
            { result: 340.5 }, // id=5, Clothing
            { result: 665 }, // id=6, Electronics
            { result: 1070 }, // id=7, Furniture
            { result: 340.5 }, // id=8, Clothing
            { result: 665 }, // id=9, Electronics
            { result: 1070 }, // id=10, Furniture
        ],
        warehouses: ALL_WAREHOUSES,
        tier: 1,
        tags: ['aggregation', 'window'],
    },
    {
        id: 'aggregation/count-distinct-over-partition-by',
        formula: '=COUNT(DISTINCT A) OVER (PARTITION BY B)',
        description:
            'Per-partition COUNT(DISTINCT) — distinct customers per category',
        columns: { A: 'customer_name', B: 'category' },
        sourceTable: 'test_orders',
        orderBy: 'id',
        expectedRows: [
            { result: 4 }, // Electronics: Alice, Charlie, Frank, Ivy
            { result: 3 }, // Clothing: Bob, Eve, Henry
            { result: 4 },
            { result: 3 }, // Furniture: Diana, Grace, Jack
            { result: 3 },
            { result: 4 },
            { result: 3 },
            { result: 3 },
            { result: 4 },
            { result: 3 },
        ],
        // Two engines reject COUNT(DISTINCT …) inside a window:
        //   - Redshift: "WINDOW definition is not supported" (pre-PG-14 fork).
        //   - Athena: "DISTINCT in window function parameters not yet
        //     supported" (older Presto/Trino — bare Trino itself works fine).
        // Codegen still emits the same SQL on those engines; the DB rejects
        // it at execution. Documented limitation, not a generation bug.
        warehouses: ALL_WAREHOUSES.filter(
            (w) => w !== 'redshift' && w !== 'athena',
        ),
        tier: 1,
        tags: ['aggregation', 'window'],
    },
    {
        id: 'aggregation/sum-over-empty',
        formula: '=SUM(A) OVER ()',
        description:
            'Windowed SUM with empty OVER — global total replicated on every row',
        columns: { A: 'order_amount' },
        sourceTable: 'test_orders',
        orderBy: 'id',
        expectedRows: [
            { result: 2075.5 },
            { result: 2075.5 },
            { result: 2075.5 },
            { result: 2075.5 },
            { result: 2075.5 },
            { result: 2075.5 },
            { result: 2075.5 },
            { result: 2075.5 },
            { result: 2075.5 },
            { result: 2075.5 },
        ],
        warehouses: ALL_WAREHOUSES,
        tier: 1,
        tags: ['aggregation', 'window'],
    },
    {
        id: 'aggregation/sumif-over-partition-by',
        formula: '=SUMIF(A, A > 100) OVER (PARTITION BY B)',
        description:
            'Per-partition windowed SUMIF — sum of amounts > 100 per category',
        columns: { A: 'order_amount', B: 'category' },
        sourceTable: 'test_orders',
        orderBy: 'id',
        // Electronics > 100: 180 + 310 = 490 (Alice 100 excluded, Charlie 75 excluded)
        // Clothing > 100: 250.5 (only Bob qualifies)
        // Furniture > 100: 500 + 420 + 150 = 1070
        expectedRows: [
            { result: 490 },
            { result: 250.5 },
            { result: 490 },
            { result: 1070 },
            { result: 250.5 },
            { result: 490 },
            { result: 1070 },
            { result: 250.5 },
            { result: 490 },
            { result: 1070 },
        ],
        warehouses: ALL_WAREHOUSES,
        tier: 1,
        tags: ['aggregation', 'window'],
    },
];
