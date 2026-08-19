import { describe, expect, it } from 'vitest';
import { TdcpClient, TdcpClientError } from '../src/client';
import { TdcpDatasetStore } from '../src/datasetStore';
import { JsonRpcErrorCodes, TdcpError } from '../src/jsonrpc';
import type { JsonRpcRequest } from '../src/jsonrpc';
import { createTdcpRequestHandler, createTdcpServer } from '../src/server';
import type {
    TdcpCatalog,
    TdcpColumnSchema,
    TdcpDataResult,
    TdcpDatasetDescriptor,
} from '../src/types';

/**
 * The whole protocol in one file: a tier 0/1/2 in-memory server built with
 * the SDK's request handler, consumed by the SDK's client, wired through a
 * fetch shim — control plane and data plane, no network. This is both the
 * reference implementation of a minimal server and the executable form of
 * the spec's conformance section.
 */

const ORDERS = [
    { order_id: 1, status: 'completed', amount: 10 },
    { order_id: 2, status: 'completed', amount: 20 },
    { order_id: 3, status: 'returned', amount: 30 },
];

const ORDER_COLUMNS: TdcpColumnSchema[] = [
    {
        name: 'order_id',
        type: 'number',
        sourceType: 'int64',
        label: null,
        description: null,
    },
    {
        name: 'status',
        type: 'string',
        sourceType: null,
        label: null,
        description: null,
    },
    {
        name: 'amount',
        type: 'number',
        sourceType: null,
        label: null,
        description: null,
    },
];

const CATALOG: TdcpCatalog = {
    tables: [
        {
            reference: 'orders',
            label: 'Orders',
            description: 'Test fixture',
            // Columns on demand, so the fixture exercises tabular/describe
            columns: null,
        },
    ],
    nextCursor: null,
};

const buildServer = () => {
    const store = new TdcpDatasetStore({ baseUrl: 'https://tdcp.test' });
    const pendingJobs = new Map<string, Record<string, unknown>[]>();
    const executions: string[] = [];

    const tdcpServer = createTdcpServer({
        catalog: async () => CATALOG,
        describe: async (_ctx: undefined, request) => {
            if (request.table !== 'orders') {
                throw new TdcpError(
                    JsonRpcErrorCodes.DATASET_NOT_FOUND,
                    `Unknown table "${request.table}"`,
                );
            }
            return {
                reference: 'orders',
                label: 'Orders',
                description: 'Test fixture',
                columns: ORDER_COLUMNS,
            };
        },
        read: async (_ctx, request) => {
            if (request.table !== 'orders') {
                throw new TdcpError(
                    JsonRpcErrorCodes.DATASET_NOT_FOUND,
                    `Unknown table "${request.table}"`,
                );
            }
            return store.mint({
                schema: ORDER_COLUMNS,
                rows: ORDERS.slice(0, request.limit),
                principal: null,
            });
        },
        scan: {
            // This fixture can only push equality on status
            plan: async (_ctx, request) => ({
                pushable: (request.predicates ?? []).filter(
                    (predicate) =>
                        predicate.column === 'status' &&
                        predicate.operator === 'eq',
                ),
            }),
            execute: async (_ctx, _request, plan) => {
                executions.push('scan');
                const rows = ORDERS.filter((row) =>
                    plan.pushable.every((predicate) =>
                        predicate.values.includes(row.status),
                    ),
                );
                return store.mint({
                    schema: ORDER_COLUMNS,
                    rows,
                    principal: null,
                });
            },
        },
        queryDialects: [
            {
                dialect: 'demo:pick',
                form: 'structured',
                payloadSchema: {
                    type: 'object',
                    required: ['table'],
                    properties: { table: { type: 'string' } },
                },
                docsUrl: null,
            },
            {
                dialect: 'demo:slow',
                form: 'text',
                payloadSchema: null,
                docsUrl: null,
            },
        ],
        query: async (_ctx, request) => {
            if (request.dialect === 'demo:slow') {
                const datasetId = `job_${pendingJobs.size + 1}`;
                pendingJobs.set(datasetId, ORDERS);
                return { status: 'pending', datasetId, pollAfterMs: 0 };
            }
            if (request.params?.table !== 'orders') {
                throw new TdcpError(
                    JsonRpcErrorCodes.DATASET_NOT_FOUND,
                    'demo:pick params.table must name a catalog table',
                );
            }
            return store.mint({
                schema: ORDER_COLUMNS,
                rows: ORDERS,
                principal: null,
            });
        },
        poll: async (_ctx, request) => {
            const rows = pendingJobs.get(request.datasetId);
            if (!rows) {
                throw new TdcpError(
                    JsonRpcErrorCodes.DATASET_NOT_FOUND,
                    `Unknown dataset "${request.datasetId}"`,
                );
            }
            pendingJobs.delete(request.datasetId);
            return store.mint({
                schema: ORDER_COLUMNS,
                rows,
                principal: null,
            });
        },
    });
    const handler = createTdcpRequestHandler(tdcpServer);

    return { handler, store, tdcpServer, executions };
};

/**
 * Routes the client's fetches in memory: POSTs to the endpoint hit the
 * request handler, GETs under /data/ serve JSONL from the dataset store
 * with the same bearer semantics as the node transport.
 */
const buildFetchShim = (server: ReturnType<typeof buildServer>): typeof fetch =>
    (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === 'https://tdcp.test/rpc') {
            const request = JSON.parse(String(init?.body)) as JsonRpcRequest;
            const response = await server.handler(request, undefined);
            return new Response(JSON.stringify(response), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            });
        }
        const dataMatch = url.match(/\/data\/([A-Za-z0-9_-]+)$/);
        if (dataMatch) {
            const headers = new Headers(init?.headers);
            const bearer =
                headers.get('Authorization')?.replace('Bearer ', '') ?? null;
            const read = server.store.read(dataMatch[1], bearer, null);
            if (read.kind === 'notFound')
                return new Response('not found', { status: 404 });
            if (read.kind === 'unauthorized')
                return new Response('unauthorized', { status: 401 });
            const jsonl = read.rows
                .map((row) => JSON.stringify(row))
                .join('\n');
            return new Response(jsonl, {
                status: 200,
                headers: { 'Content-Type': 'application/jsonl' },
            });
        }
        return new Response('not found', { status: 404 });
    }) as typeof fetch;

const build = () => {
    const server = buildServer();
    const client = new TdcpClient({
        url: 'https://tdcp.test/rpc',
        fetchImpl: buildFetchShim(server),
    });
    return { server, client };
};

const expectReady = (result: TdcpDataResult): TdcpDatasetDescriptor => {
    if (result.status !== 'ready') {
        throw new Error(`Expected a ready descriptor, got ${result.status}`);
    }
    return result;
};

describe('TDCP round trip: SDK client against SDK server', () => {
    it('derives capabilities from the provided handlers', async () => {
        const { client } = build();
        const capabilities = await client.capabilities();
        expect(capabilities.read).toBe(true);
        expect(capabilities.scan).toBe(true);
        expect(capabilities.describe).toBe(true);
        expect(capabilities.compose).toBe(false);
        expect(capabilities.queryDialects.map((d) => d.dialect)).toEqual([
            'demo:pick',
            'demo:slow',
        ]);
        expect(capabilities.queryDialects[0].form).toBe('structured');
        expect(capabilities.queryDialects[0].payloadSchema).toMatchObject({
            required: ['table'],
        });
    });

    it('describes a table whose catalog entry omits columns', async () => {
        const { client } = build();
        const catalog = await client.catalog();
        expect(catalog.tables[0].columns).toBeNull();
        expect(catalog.nextCursor).toBeNull();

        const described = await client.describe('orders');
        expect(described.columns).toHaveLength(3);
        expect(described.columns[0].sourceType).toBe('int64');
    });

    it('reads a table end to end: read, stream rows', async () => {
        const { client } = build();
        const descriptor = expectReady(await client.read({ table: 'orders' }));
        expect(descriptor.rowCount).toBe(3);
        expect(descriptor.links).toHaveLength(1);

        const rows = [];
        for await (const row of client.fetchJsonlRows(descriptor.links[0])) {
            rows.push(row);
        }
        expect(rows).toEqual(ORDERS);
    });

    it('honors limit on tier 0 read', async () => {
        const { client } = build();
        const descriptor = expectReady(
            await client.read({ table: 'orders', limit: 2 }),
        );
        expect(descriptor.rowCount).toBe(2);
    });

    it('pushes pushable predicates and stamps them on the descriptor', async () => {
        const { client } = build();
        const descriptor = expectReady(
            await client.scan({
                table: 'orders',
                predicates: [
                    { column: 'status', operator: 'eq', values: ['completed'] },
                ],
                predicateMode: 'bestEffort',
            }),
        );
        expect(descriptor.rowCount).toBe(2);
        expect(descriptor.pushedPredicates).toHaveLength(1);
    });

    it('refuses exact mode before executing anything', async () => {
        const { server, client } = build();
        await expect(
            client.scan({
                table: 'orders',
                predicates: [
                    { column: 'amount', operator: 'gt', values: [15] },
                ],
                predicateMode: 'exact',
            }),
        ).rejects.toMatchObject({
            code: JsonRpcErrorCodes.PREDICATES_NOT_SATISFIABLE,
        });
        // The pre-flight guarantee: the scan execute handler never ran
        expect(server.executions).toEqual([]);
    });

    it('compares exact predicates by value, not only by count', async () => {
        const { server } = build();
        await expect(
            server.tdcpServer.execute(undefined, {
                method: 'tabular/scan',
                table: 'orders',
                predicates: [
                    { column: 'status', operator: 'eq', values: ['returned'] },
                    { column: 'amount', operator: 'gt', values: [15] },
                ],
                predicateMode: 'exact',
            }),
        ).rejects.toMatchObject({
            code: JsonRpcErrorCodes.PREDICATES_NOT_SATISFIABLE,
        });
    });

    it('serves best-effort mode for the same unpushable predicate', async () => {
        const { client } = build();
        const descriptor = expectReady(
            await client.scan({
                table: 'orders',
                predicates: [
                    { column: 'amount', operator: 'gt', values: [15] },
                ],
                predicateMode: 'bestEffort',
            }),
        );
        // Nothing pushed: full table comes back, consumer re-applies
        expect(descriptor.pushedPredicates).toHaveLength(0);
        expect(descriptor.rowCount).toBe(3);
    });

    it('runs a structured dialect via params', async () => {
        const { client } = build();
        const descriptor = expectReady(
            await client.query({
                dialect: 'demo:pick',
                params: { table: 'orders' },
            }),
        );
        expect(descriptor.rowCount).toBe(3);
    });

    it('rejects the wrong request form for a dialect', async () => {
        const { client } = build();
        await expect(
            client.query({ dialect: 'demo:pick', query: 'orders' }),
        ).rejects.toMatchObject({ code: JsonRpcErrorCodes.INVALID_PARAMS });
        await expect(
            client.query({ dialect: 'demo:slow', params: { table: 'x' } }),
        ).rejects.toMatchObject({ code: JsonRpcErrorCodes.INVALID_PARAMS });
    });

    it('resolves a pending result by polling until ready', async () => {
        const { client } = build();
        const result = await client.query({
            dialect: 'demo:slow',
            query: 'anything',
        });
        expect(result.status).toBe('pending');

        const descriptor = await client.waitForReady(result, {
            timeoutMs: 5_000,
        });
        expect(descriptor.status).toBe('ready');
        expect(descriptor.rowCount).toBe(3);

        const rows = [];
        for await (const row of client.fetchJsonlRows(descriptor.links[0])) {
            rows.push(row);
        }
        expect(rows).toEqual(ORDERS);
    });

    it('rejects undeclared dialects with the capability error code', async () => {
        const { client } = build();
        await expect(
            client.query({ dialect: 'sql:duckdb', query: 'SELECT 1' }),
        ).rejects.toMatchObject({
            code: JsonRpcErrorCodes.CAPABILITY_NOT_SUPPORTED,
        });
    });

    it('rejects compose references on a non-compose server', async () => {
        const { client } = build();
        await expect(
            client.query({
                dialect: 'demo:slow',
                query: 'anything',
                references: { other: 'ds_x' },
            }),
        ).rejects.toMatchObject({
            code: JsonRpcErrorCodes.CAPABILITY_NOT_SUPPORTED,
        });
    });

    it('surfaces protocol errors as TdcpClientError with the code intact', async () => {
        const { client } = build();
        const error = await client
            .read({ table: 'nope' })
            .then(() => null)
            .catch((e: unknown) => e);
        expect(error).toBeInstanceOf(TdcpClientError);
        expect((error as TdcpClientError).code).toBe(
            JsonRpcErrorCodes.DATASET_NOT_FOUND,
        );
    });

    it('rejects a data-plane fetch with the wrong bearer token', async () => {
        const { client } = build();
        const descriptor = expectReady(await client.read({ table: 'orders' }));
        const tampered = { ...descriptor.links[0], token: 'tok_stolen' };
        await expect(async () => {
            const rows = [];
            for await (const row of client.fetchJsonlRows(tampered)) {
                rows.push(row);
            }
        }).rejects.toThrow('401');
    });

    it('binds datasets to the principal that minted them', () => {
        const store = new TdcpDatasetStore({ baseUrl: 'https://tdcp.test' });
        const descriptor = store.mint({
            schema: ORDER_COLUMNS,
            rows: ORDERS,
            principal: 'user_a',
        });
        const token = descriptor.links[0].token!;
        expect(store.read(descriptor.datasetId, token, 'user_b').kind).toBe(
            'unauthorized',
        );
        expect(store.read(descriptor.datasetId, token, 'user_a').kind).toBe(
            'ok',
        );
    });

    it('caps the in-memory store at its configured row count', () => {
        const store = new TdcpDatasetStore({
            baseUrl: 'https://tdcp.test',
            maxRows: 2,
        });
        expect(() =>
            store.mint({
                schema: ORDER_COLUMNS,
                rows: ORDERS,
                principal: null,
            }),
        ).toThrow(/caps them at 2 rows/);
    });
});
