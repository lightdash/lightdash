import { toolGrepWarehouseColumnsOutputSchema } from '@lightdash/common';
import { describe, expect, it, vi } from 'vitest';
import type { ListWarehouseColumnsFn } from '../types/aiAgentDependencies';
import { getGrepWarehouseColumns } from './grepWarehouseColumns';

vi.mock('@sentry/node', () => ({
    captureException: vi.fn(),
    addBreadcrumb: vi.fn(),
    getActiveSpan: vi.fn(),
}));

vi.mock('../../../../logging/logger', () => ({
    __esModule: true,
    default: { error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const tables = [
    {
        database: 'db',
        schema: 'raw',
        table: 'orders',
        columns: [
            { name: 'id', type: 'number' },
            { name: 'customer_id', type: 'number' },
            { name: 'created_at', type: 'timestamp' },
        ],
    },
    {
        database: 'db',
        schema: 'raw',
        table: 'customers',
        columns: [
            { name: 'customer_id', type: 'number' },
            { name: 'paid', type: 'boolean' },
        ],
    },
    {
        database: 'db',
        schema: 'raw',
        table: 'events',
        columns: [{ name: 'payload', type: 'string' }],
    },
];

const grep = async (
    args: { pattern: string; schema?: string; limit?: number },
    listWarehouseColumns: ListWarehouseColumnsFn = async () => ({
        tables,
        unreadTableCount: 0,
    }),
) => {
    const tool = getGrepWarehouseColumns({ listWarehouseColumns });
    if (!tool.execute) throw new Error('tool has no execute');
    return toolGrepWarehouseColumnsOutputSchema.parse(
        await tool.execute(
            { limit: 50, ...args },
            { messages: [], toolCallId: 'call', context: {} },
        ),
    );
};

describe('getGrepWarehouseColumns', () => {
    it('names the tables that hold a column, with only the columns that matched', async () => {
        const output = await grep({ pattern: 'customer id' });
        expect(output).toMatchObject({
            structuredContent: {
                matchCount: 2,
                searchedTableCount: 3,
                tables: [
                    {
                        qualifiedName: 'db.raw.orders',
                        columns: [{ name: 'customer_id', type: 'number' }],
                    },
                    {
                        qualifiedName: 'db.raw.customers',
                        columns: [{ name: 'customer_id', type: 'number' }],
                    },
                ],
            },
        });
        expect(output.result).toContain('db.raw.orders: customer_id (number)');
    });

    it('matches a column by its type, and a short word only as a whole token', async () => {
        expect(await grep({ pattern: 'timestamp' })).toMatchObject({
            structuredContent: {
                tables: [{ columns: [{ name: 'created_at' }] }],
            },
        });
        // "id" is in "paid", which is not an id column.
        const ids = await grep({ pattern: 'id' });
        expect(JSON.stringify(ids)).not.toContain('paid');
    });

    it('says how many tables were left unsearched and passes the schema on', async () => {
        const listWarehouseColumns = vi.fn<ListWarehouseColumnsFn>(
            async () => ({ tables, unreadTableCount: 40 }),
        );
        const output = await grep(
            { pattern: 'nothing_like_this', schema: 'raw' },
            listWarehouseColumns,
        );
        expect(listWarehouseColumns).toHaveBeenCalledWith({ schema: 'raw' });
        expect(output.result).toContain('No column matched');
        expect(output.result).toContain('40 more table(s) were not searched');
    });

    it('returns an error when the columns cannot be read', async () => {
        const output = await grep({ pattern: 'id' }, async () => {
            throw new Error('warehouse down');
        });
        expect(output.metadata.status).toBe('error');
    });
});
