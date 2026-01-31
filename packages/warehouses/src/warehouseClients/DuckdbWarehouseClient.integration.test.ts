/**
 * Integration tests for DuckDB Warehouse Client
 *
 * These tests use a real DuckDB database file to verify the adapter works correctly.
 * Run with: npm test -- --testPathPattern="integration"
 */
import {
    DuckdbWarehouseClient,
    DuckdbSqlBuilder,
} from './DuckdbWarehouseClient';
import { WarehouseTypes } from '@lightdash/common';
import * as fs from 'fs';
import * as path from 'path';

const TEST_DB_PATH = '/tmp/lightdash-test-duckdb/test_analytics.duckdb';

// Skip tests if the test database doesn't exist
const describeIfDbExists = fs.existsSync(TEST_DB_PATH) ? describe : describe.skip;

describeIfDbExists('DuckDB Integration Tests', () => {
    let client: DuckdbWarehouseClient;

    const credentials = {
        type: WarehouseTypes.DUCKDB as const,
        path: TEST_DB_PATH,
        schema: 'main',
    };

    beforeAll(() => {
        client = new DuckdbWarehouseClient(credentials);
    });

    afterAll(async () => {
        await client.close();
    });

    it('should connect to DuckDB database', async () => {
        await expect(client.test()).resolves.not.toThrow();
    });

    it('should list all tables', async () => {
        const tables = await client.getAllTables();
        expect(Array.isArray(tables)).toBe(true);
        expect(tables.length).toBeGreaterThan(0);

        // Check table structure
        const tableNames = tables.map(t => t.table);
        console.log('Available tables:', tableNames);
        // Test database has: customers, order_items, orders, products
        expect(tableNames).toContain('orders');
    });

    it('should run a query and return results', async () => {
        const result = await client.runQuery('SELECT COUNT(*) as count FROM orders');

        expect(result.rows).toHaveLength(1);
        expect(result.rows[0]).toHaveProperty('count');
        expect(typeof result.rows[0].count).toBe('bigint');
        console.log('Orders count:', result.rows[0].count);
    });

    it('should infer field types from query results', async () => {
        const result = await client.runQuery(`
            SELECT
                'test' as string_col,
                123 as int_col,
                123.45 as float_col,
                true as bool_col
        `);

        expect(result.fields).toHaveProperty('string_col');
        expect(result.fields).toHaveProperty('int_col');
        expect(result.fields).toHaveProperty('float_col');
        expect(result.fields).toHaveProperty('bool_col');
    });

    it('should handle empty results', async () => {
        const result = await client.runQuery('SELECT * FROM orders WHERE 1=0');

        expect(result.rows).toHaveLength(0);
        expect(result.fields).toEqual({});
    });
});

describe('DuckdbSqlBuilder Integration', () => {
    const sqlBuilder = new DuckdbSqlBuilder();

    it('should generate correct adapter type', () => {
        expect(sqlBuilder.getAdapterType()).toBe('duckdb');
    });

    it('should use double quotes for field quoting', () => {
        expect(sqlBuilder.getFieldQuoteChar()).toBe('"');
    });

    it('should use || for string concatenation', () => {
        expect(sqlBuilder.concatString('a', 'b', 'c')).toBe('(a || b || c)');
    });
});
