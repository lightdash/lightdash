import { describe, expect, it, vi } from 'vitest';
import { runSnowflakeAiBoundaryChecks } from './snowflakeAiBoundaryChecks';

const makeClient = (
    responses: Array<{ rows?: Record<string, unknown>[]; error?: boolean }>,
) => {
    const runQuery = vi.fn(
        async (_sql: string, _tags: Record<string, string>) => {
            const response = responses.shift();
            if (response?.error) throw new Error('Blocked');
            return { rows: response?.rows ?? [] };
        },
    );
    return { runQuery };
};

describe('Snowflake AI boundary checks', () => {
    it('maps a protected session to passes without returning values', async () => {
        const client = makeClient([
            { rows: [{ AGENT_ACTIVE: true, ACTIVE_SCOPES: 'scope' }] },
            { rows: [{ TOTAL: 4, UNMASKED: 0, SECRET: 'hidden' }] },
            { error: true },
            { error: true },
        ]);
        const results = await runSnowflakeAiBoundaryChecks({
            client,
            protectedColumn: {
                database: 'DB',
                schema: 'PRIVATE',
                table: 'PEOPLE',
                column: 'SECRET',
            },
            warehouseQueryId: '01b-query',
        });
        expect(results.map(({ status }) => status)).toEqual([
            'pass',
            'pass',
            'pass',
            'pass',
        ]);
        expect(JSON.stringify(results)).not.toContain('hidden');
        expect(client.runQuery.mock.calls[1]?.[0]).toContain(
            'COUNT_IF("SECRET" IS NOT NULL',
        );
    });

    it('treats a null COUNT_IF result as no unmasked rows', async () => {
        const client = makeClient([
            { rows: [{ AGENT_ACTIVE: true, ACTIVE_SCOPES: 'scope' }] },
            { rows: [{ TOTAL: 2, UNMASKED: null }] },
            { error: true },
        ]);
        const results = await runSnowflakeAiBoundaryChecks({
            client,
            protectedColumn: {
                database: 'DB',
                schema: 'S',
                table: 'T',
                column: 'C',
            },
            warehouseQueryId: null,
        });
        expect(results[1]?.status).toBe('pass');
    });

    it('maps missing scope, unmasked data and allowed operations to failures', async () => {
        const client = makeClient([
            { rows: [{ AGENT_ACTIVE: true, ACTIVE_SCOPES: '' }] },
            { rows: [{ TOTAL: 4, UNMASKED: 1 }] },
            { rows: [{ 'COUNT(*)': 1 }] },
            { rows: [] },
        ]);
        const results = await runSnowflakeAiBoundaryChecks({
            client,
            protectedColumn: {
                database: 'DB',
                schema: 'PRIVATE',
                table: 'PEOPLE',
                column: 'SECRET',
            },
            warehouseQueryId: '01b-query',
        });
        expect(results.map(({ status }) => status)).toEqual([
            'fail',
            'fail',
            'fail',
            'fail',
        ]);
        expect(results[0]?.fixStep).toBe(4);
    });

    it('skips checks without a column or prior query', async () => {
        const client = makeClient([
            { rows: [{ AGENT_ACTIVE: false, ACTIVE_SCOPES: null }] },
            { error: true },
        ]);
        const results = await runSnowflakeAiBoundaryChecks({
            client,
            protectedColumn: null,
            warehouseQueryId: null,
        });
        expect(results.map(({ status }) => status)).toEqual([
            'fail',
            'skipped',
            'skipped',
            'pass',
        ]);
        expect(results[0]?.fixStep).toBe(2);
        expect(client.runQuery).toHaveBeenCalledTimes(2);
    });

    it('does not mistake a failed session for blocked access', async () => {
        const client = makeClient([{ error: true }]);
        const results = await runSnowflakeAiBoundaryChecks({
            client,
            protectedColumn: null,
            warehouseQueryId: '01b-query',
        });
        expect(results.map(({ status }) => status)).toEqual([
            'fail',
            'skipped',
            'skipped',
            'skipped',
        ]);
        expect(client.runQuery).toHaveBeenCalledTimes(1);
    });
});
