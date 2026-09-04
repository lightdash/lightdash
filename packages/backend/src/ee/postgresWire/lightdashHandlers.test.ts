import { SupportedDbtAdapter, type Account } from '@lightdash/common';
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
        targetDatabase: SupportedDbtAdapter.POSTGRES,
        fields: [
            {
                fieldId: 'orders_status',
                table: 'orders',
                name: 'status',
                kind: 'dimension',
                type: 'string',
                description: null,
                timeInterval: null,
            },
            {
                fieldId: 'orders_amount',
                table: 'orders',
                name: 'amount',
                kind: 'dimension',
                type: 'number',
                description: null,
                timeInterval: null,
            },
            {
                fieldId: 'orders_is_completed',
                table: 'orders',
                name: 'is_completed',
                kind: 'dimension',
                type: 'boolean',
                description: null,
                timeInterval: null,
            },
            {
                fieldId: 'orders_order_date',
                table: 'orders',
                name: 'order_date',
                kind: 'dimension',
                type: 'date',
                description: null,
                timeInterval: null,
            },
            {
                fieldId: 'orders_total',
                table: 'orders',
                name: 'total',
                kind: 'metric',
                type: 'sum',
                description: null,
                timeInterval: null,
            },
            {
                fieldId: 'orders_count',
                table: 'orders',
                name: 'count',
                kind: 'metric',
                type: 'count',
                description: null,
                timeInterval: null,
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

    it('logs describe failures with redacted sql so extended-protocol errors are visible', async () => {
        const Logger = (await import('../../logging/logger')).default;
        const warn = vi.spyOn(Logger, 'warn');
        try {
            await expect(
                handlers.describe(
                    session,
                    "SELECT (i.keys).n FROM orders WHERE orders_status = 'secret'",
                ),
            ).rejects.toThrow();
            expect(warn).toHaveBeenCalledWith(
                expect.stringMatching(/pgwire: describe failed \(/),
            );
            const logged = String(warn.mock.calls.at(-1)?.[0]);
            expect(logged).not.toContain('secret');
        } finally {
            warn.mockRestore();
        }
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

    it('accepts database-qualified table names the way Postgres does', async () => {
        const sql =
            'SELECT "orders_status" FROM "project-uuid"."public"."orders" LIMIT 1';
        await expect(handlers.describe(session, sql)).resolves.toEqual([
            { name: 'orders_status', oid: 25 },
        ]);
        await expect(handlers.query(session, sql)).resolves.toMatchObject({
            type: 'rows',
            rows: [['completed']],
        });
        // catalog queries too
        await expect(
            handlers.query(
                session,
                'select relname from "project-uuid"."pg_catalog"."pg_class" where relnamespace = 2200 order by 1',
            ),
        ).resolves.toMatchObject({ rows: [['orders']] });
        // a parseable statement that merely mentions the database name is untouched
        await expect(
            handlers.query(session, `select '"project-uuid"."a"."b"' as s`),
        ).resolves.toMatchObject({ rows: [['"project-uuid"."a"."b"']] });
        // identifiers with escaped quotes still get the qualifier stripped
        await expect(
            handlers.query(
                session,
                'SELECT x FROM "project-uuid"."public"."weird""name"',
            ),
        ).rejects.toMatchObject({
            message: expect.stringMatching(
                /Table "weird""name" does not exist/,
            ),
        });
        // a different database's qualifier still fails like Postgres
        await expect(
            handlers.query(
                session,
                'SELECT "orders_status" FROM "other-db"."public"."orders"',
            ),
        ).rejects.toMatchObject({ code: '42601' });
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
        targetDatabase: SupportedDbtAdapter.POSTGRES,
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
                        timeInterval: null,
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
                    order_date_year: {
                        fieldType: 'dimension',
                        type: 'date',
                        name: 'order_date_year',
                        label: 'Order date year',
                        table: 'orders',
                        tableLabel: 'Orders',
                        sql: "DATE_TRUNC('YEAR', ${TABLE}.order_date)",
                        hidden: false,
                        timeInterval: 'YEAR',
                        timeIntervalBaseDimensionName: 'order_date',
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
                targetDatabase: SupportedDbtAdapter.POSTGRES,
                fields: [
                    {
                        fieldId: 'orders_status',
                        table: 'orders',
                        name: 'status',
                        kind: 'dimension',
                        type: 'string',
                        description: 'Order status',
                        timeInterval: null,
                    },
                    {
                        fieldId: 'orders_order_date_year',
                        table: 'orders',
                        name: 'order_date_year',
                        kind: 'dimension',
                        type: 'date',
                        description: 'Order date year',
                        timeInterval: {
                            frame: 'YEAR',
                            baseDimensionName: 'order_date',
                        },
                    },
                    {
                        fieldId: 'orders_total',
                        table: 'orders',
                        name: 'total',
                        kind: 'metric',
                        type: 'sum',
                        description: 'Total amount',
                        timeInterval: null,
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
                    'orders_order_date_year',
                    'Order date year',
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
