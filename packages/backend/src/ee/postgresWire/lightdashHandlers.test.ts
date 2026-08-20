import { type Account } from '@lightdash/common';
import { describe, expect, it, vi } from 'vitest';
import type { ServiceRepository } from '../../services/ServiceRepository';
import {
    createLightdashPgWireHandlers,
    type LightdashPgWireSession,
} from './lightdashHandlers';
import { buildCatalogRelations } from './pgCatalog/catalogRelations';
import { type PgWireTable } from './types';

const catalog: PgWireTable[] = [
    {
        name: 'orders',
        description: null,
        fields: [
            {
                fieldId: 'orders_status',
                kind: 'dimension',
                type: 'string',
                description: null,
            },
            {
                fieldId: 'orders_amount',
                kind: 'dimension',
                type: 'number',
                description: null,
            },
            {
                fieldId: 'orders_is_completed',
                kind: 'dimension',
                type: 'boolean',
                description: null,
            },
            {
                fieldId: 'orders_order_date',
                kind: 'dimension',
                type: 'date',
                description: null,
            },
            {
                fieldId: 'orders_total',
                kind: 'metric',
                type: 'sum',
                description: null,
            },
            {
                fieldId: 'orders_count',
                kind: 'metric',
                type: 'count',
                description: null,
            },
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
    databaseName: 'project-uuid',
    catalog,
    catalogRelations: buildCatalogRelations({
        databaseName: 'project-uuid',
        userName: 'alice@example.com',
        catalog,
    }),
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
        ).resolves.toEqual([{ name: 'table_name', oid: 19 }]);
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

    it('answers schema probes without touching the warehouse', async () => {
        runExploreQuery.mockClear();
        await expect(
            handlers.query(
                session,
                'SELECT orders_status FROM orders WHERE 1 = 0',
            ),
        ).resolves.toEqual({
            type: 'rows',
            fields: [{ name: 'orders_status', oid: 25 }],
            rows: [],
            commandTag: 'SELECT 0',
        });
        await expect(
            handlers.query(
                session,
                'SELECT orders_status, orders_total FROM orders LIMIT 0',
            ),
        ).resolves.toMatchObject({
            type: 'rows',
            rows: [],
            commandTag: 'SELECT 0',
        });
        expect(runExploreQuery).not.toHaveBeenCalled();
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

describe('lightdash pgwire handlers: end to end through authenticate', () => {
    const explore = {
        name: 'orders',
        label: 'Orders',
        baseTable: 'orders',
        joinedTables: [],
        tables: {
            orders: {
                name: 'orders',
                label: 'Orders',
                description: 'Orders placed by customers',
                database: 'db',
                schema: 'public',
                sqlTable: 'orders',
                dimensions: {
                    status: {
                        fieldType: 'dimension',
                        type: 'string',
                        name: 'status',
                        label: 'Status',
                        table: 'orders',
                        tableLabel: 'Orders',
                        sql: '${TABLE}.status',
                        hidden: false,
                        description: 'Order status',
                    },
                    secret: {
                        fieldType: 'dimension',
                        type: 'string',
                        name: 'secret',
                        label: 'Secret',
                        table: 'orders',
                        tableLabel: 'Orders',
                        sql: '${TABLE}.secret',
                        hidden: true,
                    },
                },
                metrics: {
                    total: {
                        fieldType: 'metric',
                        type: 'sum',
                        name: 'total',
                        label: 'Total amount',
                        table: 'orders',
                        tableLabel: 'Orders',
                        sql: '${TABLE}.amount',
                        hidden: false,
                    },
                },
                lineageGraph: {},
            },
        },
    };
    const services = {
        getUserService: () => ({
            loginWithPersonalAccessToken: async () => ({
                userUuid: 'user-uuid',
                email: 'alice@example.com',
                organizationUuid: 'org-uuid',
                organizationName: 'Acme',
                organizationCreatedAt: new Date(0),
                ability: { can: () => true },
                abilityRules: [],
            }),
        }),
        getProjectService: () => ({
            getAllExploresSummary: async () => [{ name: 'orders' }],
            getExplore: async () => explore,
            runExploreQuery,
        }),
    } as unknown as ServiceRepository;

    it('builds the catalog with descriptions and hidden fields removed, then serves catalog SQL', async () => {
        const e2e = createLightdashPgWireHandlers(services);
        const connected = await e2e.authenticate({
            user: 'alice@example.com',
            database: '11111111-1111-4111-8111-111111111111',
            password: 'ldpat_test',
        });
        expect(connected.catalog).toEqual([
            {
                name: 'orders',
                description: 'Orders placed by customers',
                fields: [
                    {
                        fieldId: 'orders_status',
                        kind: 'dimension',
                        type: 'string',
                        description: 'Order status',
                    },
                    {
                        fieldId: 'orders_total',
                        kind: 'metric',
                        type: 'sum',
                        description: 'Total amount',
                    },
                ],
            },
        ]);
        expect(
            connected.catalogRelations
                .get('pg_catalog.pg_class')
                ?.rows.some((r) => r.relname === 'orders'),
        ).toBe(true);

        const result = await e2e.query(
            connected,
            `select c.relname, obj_description(c.oid, 'pg_class') as remarks, a.attname, col_description(c.oid, a.attnum) from pg_class c join pg_attribute a on a.attrelid = c.oid where c.relnamespace = 2200 order by a.attnum`,
        );
        expect(result).toMatchObject({
            type: 'rows',
            rows: [
                [
                    'orders',
                    'Orders placed by customers',
                    'orders_status',
                    'Order status',
                ],
                [
                    'orders',
                    'Orders placed by customers',
                    'orders_total',
                    'Total amount',
                ],
            ],
        });
        expect(
            await e2e.describe(connected, 'select current_database()'),
        ).toEqual([{ name: 'current_database', oid: 19 }]);
        expect(
            await e2e.query(connected, 'select current_database()'),
        ).toMatchObject({
            rows: [['11111111-1111-4111-8111-111111111111']],
        });
    });
});
