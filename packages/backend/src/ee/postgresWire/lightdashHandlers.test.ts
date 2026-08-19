import { type Account } from '@lightdash/common';
import { describe, expect, it, vi } from 'vitest';
import type { ServiceRepository } from '../../services/ServiceRepository';
import {
    createLightdashPgWireHandlers,
    type LightdashPgWireSession,
} from './lightdashHandlers';
import { type PgWireTable } from './types';

const catalog: PgWireTable[] = [
    {
        name: 'orders',
        fields: [
            { fieldId: 'orders_status', kind: 'dimension', type: 'string' },
            { fieldId: 'orders_amount', kind: 'dimension', type: 'number' },
            {
                fieldId: 'orders_is_completed',
                kind: 'dimension',
                type: 'boolean',
            },
            { fieldId: 'orders_order_date', kind: 'dimension', type: 'date' },
            { fieldId: 'orders_total', kind: 'metric', type: 'sum' },
            { fieldId: 'orders_count', kind: 'metric', type: 'count' },
        ],
    },
];

const runExploreQuery = vi.fn(async () => ({
    rows: [
        {
            orders_status: { value: { raw: 'completed', formatted: '' } },
            orders_total: { value: { raw: 2397, formatted: '' } },
            orders_count: { value: { raw: 12, formatted: '' } },
        },
    ],
}));

const serviceRepository = {
    getProjectService: () => ({ runExploreQuery }),
} as unknown as ServiceRepository;

const handlers = createLightdashPgWireHandlers(serviceRepository);

const session: LightdashPgWireSession = {
    account: { user: { email: 'alice@example.com' } } as unknown as Account,
    projectUuid: 'project-uuid',
    catalog,
};

const EXPLORE_SQL =
    "SELECT orders_status, orders_total, orders_count FROM orders WHERE orders_status = 'completed' ORDER BY orders_total DESC LIMIT 10";

describe('lightdash pgwire handlers: describe vs query', () => {
    it('describes an explore query from the catalog without running it', async () => {
        runExploreQuery.mockClear();
        const fields = await handlers.describe(session, EXPLORE_SQL);
        expect(fields).toEqual([
            { name: 'orders_status', oid: 25 },
            { name: 'orders_total', oid: 701 },
            { name: 'orders_count', oid: 20 },
        ]);
        expect(runExploreQuery).not.toHaveBeenCalled();
    });

    it('returns the same fields from describe and query for an explore query', async () => {
        const described = await handlers.describe(session, EXPLORE_SQL);
        const result = await handlers.query(session, EXPLORE_SQL);
        expect(result.type).toBe('rows');
        if (result.type !== 'rows') {
            throw new Error('expected rows');
        }
        expect(result.fields).toEqual(described);
        expect(result.rows).toEqual([['completed', '2397', '12']]);
        expect(runExploreQuery).toHaveBeenCalledTimes(1);
    });

    it('describes the placeholder shapes Describe(S) produces before Bind', async () => {
        runExploreQuery.mockClear();
        await expect(
            handlers.describe(
                session,
                "SELECT orders_status FROM orders WHERE orders_status = '' AND orders_amount > 1 AND orders_is_completed = TRUE LIMIT 1",
            ),
        ).resolves.toEqual([{ name: 'orders_status', oid: 25 }]);
        expect(runExploreQuery).not.toHaveBeenCalled();
    });

    it('answers session statements, constants and information_schema in memory', async () => {
        await expect(
            handlers.describe(session, 'SET x = 1'),
        ).resolves.toBeNull();
        await expect(handlers.describe(session, 'BEGIN')).resolves.toBeNull();
        await expect(handlers.describe(session, 'SELECT 1')).resolves.toEqual([
            { name: '?column?', oid: 20 },
        ]);
        await expect(
            handlers.describe(
                session,
                'SELECT table_name FROM information_schema.tables',
            ),
        ).resolves.toEqual([{ name: 'table_name', oid: 25 }]);
        await expect(handlers.query(session, 'BEGIN')).resolves.toEqual({
            type: 'command',
            commandTag: 'BEGIN',
        });
        await expect(handlers.query(session, 'discard all;')).resolves.toEqual({
            type: 'command',
            commandTag: 'DISCARD ALL',
        });
        await expect(handlers.query(session, 'DISCARD PLANS')).resolves.toEqual(
            {
                type: 'command',
                commandTag: 'DISCARD',
            },
        );
        await expect(
            handlers.query(session, 'SHOW server_version'),
        ).resolves.toMatchObject({ type: 'rows', commandTag: 'SHOW' });
    });

    it('surfaces compile errors from describe with the same SQLSTATE as query', async () => {
        const sql = 'SELECT nope FROM orders';
        await expect(handlers.describe(session, sql)).rejects.toMatchObject({
            code: '42703',
        });
        await expect(handlers.query(session, sql)).rejects.toMatchObject({
            code: '42703',
        });
    });
});
