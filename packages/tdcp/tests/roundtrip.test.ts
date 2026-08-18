import { describe, expect, it } from 'vitest';
import { TdcpClient } from '../src/client';
import { JsonRpcErrorCodes, TdcpError } from '../src/jsonrpc';
import type { JsonRpcRequest } from '../src/jsonrpc';
import { createTdcpRequestHandler } from '../src/server';
import type {
    TdcpCatalog,
    TdcpDataLink,
    TdcpDatasetDescriptor,
} from '../src/types';

/**
 * The whole protocol in one file: a tier 0/1 in-memory server built with
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

const CATALOG: TdcpCatalog = {
    tables: [
        {
            reference: 'orders',
            label: 'Orders',
            description: 'Test fixture',
            columns: [
                { name: 'order_id', type: 'number', label: null, description: null },
                { name: 'status', type: 'string', label: null, description: null },
                { name: 'amount', type: 'number', label: null, description: null },
            ],
        },
    ],
};

const buildServer = () => {
    // Dataset store: handle -> rows, served on the shim's data plane
    const datasets = new Map<string, Record<string, unknown>[]>();
    let handleCounter = 0;

    const mintDescriptor = (
        rows: Record<string, unknown>[],
        pushedPredicates?: TdcpDatasetDescriptor['pushedPredicates'],
    ): TdcpDatasetDescriptor => {
        handleCounter += 1;
        const datasetId = `ds_${handleCounter}`;
        datasets.set(datasetId, rows);
        const link: TdcpDataLink = {
            encoding: 'jsonl',
            href: `https://tdcp.test/data/${datasetId}`,
            token: `tok_${datasetId}`,
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
        };
        return {
            datasetId,
            schema: CATALOG.tables[0].columns,
            rowCount: rows.length,
            producedAt: new Date().toISOString(),
            expiresAt: link.expiresAt,
            freshness: {
                sourceQueriedAt: new Date().toISOString(),
                cacheHit: false,
            },
            links: [link],
            ...(pushedPredicates ? { pushedPredicates } : {}),
        };
    };

    const handler = createTdcpRequestHandler({
        catalog: async () => CATALOG,
        read: async (_ctx, request) => {
            if (request.table !== 'orders') {
                throw new TdcpError(
                    JsonRpcErrorCodes.DATASET_NOT_FOUND,
                    `Unknown table "${request.table}"`,
                );
            }
            return mintDescriptor(ORDERS.slice(0, request.limit));
        },
        scan: async (_ctx, request) => {
            // This fixture can only push equality on status
            const pushable = (request.predicates ?? []).filter(
                (predicate) =>
                    predicate.column === 'status' &&
                    predicate.operator === 'eq',
            );
            const rows = ORDERS.filter((row) =>
                pushable.every((predicate) =>
                    predicate.values.includes(row.status),
                ),
            );
            return mintDescriptor(rows, pushable);
        },
    });

    return { handler, datasets };
};

/**
 * Routes the client's fetches in memory: POSTs to the endpoint hit the
 * request handler, GETs under /data/ serve JSONL with a streamed body.
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
        const dataMatch = url.match(/\/data\/(ds_\d+)$/);
        if (dataMatch) {
            const rows = server.datasets.get(dataMatch[1]);
            if (!rows) return new Response('not found', { status: 404 });
            const jsonl = rows.map((row) => JSON.stringify(row)).join('\n');
            return new Response(jsonl, {
                status: 200,
                headers: { 'Content-Type': 'application/jsonl' },
            });
        }
        return new Response('not found', { status: 404 });
    }) as typeof fetch;

const buildClient = () => {
    const server = buildServer();
    return new TdcpClient({
        url: 'https://tdcp.test/rpc',
        fetchImpl: buildFetchShim(server),
    });
};

describe('TDCP round trip: SDK client against SDK server', () => {
    it('derives capabilities from the provided handlers', async () => {
        const capabilities = await buildClient().capabilities();
        expect(capabilities.read).toBe(true);
        expect(capabilities.scan).toBe(true);
        expect(capabilities.queryDialects).toEqual([]);
        expect(capabilities.compose).toBe(false);
    });

    it('reads a table end to end: catalog, read, stream rows', async () => {
        const client = buildClient();
        const catalog = await client.catalog();
        expect(catalog.tables[0].reference).toBe('orders');

        const descriptor = await client.read({ table: 'orders' });
        expect(descriptor.rowCount).toBe(3);
        expect(descriptor.links).toHaveLength(1);

        const rows = [];
        for await (const row of client.fetchJsonlRows(descriptor.links![0])) {
            rows.push(row);
        }
        expect(rows).toEqual(ORDERS);
    });

    it('honors limit on tier 0 read', async () => {
        const descriptor = await buildClient().read({
            table: 'orders',
            limit: 2,
        });
        expect(descriptor.rowCount).toBe(2);
    });

    it('pushes pushable predicates and reports them', async () => {
        const descriptor = await buildClient().scan({
            table: 'orders',
            predicates: [
                { column: 'status', operator: 'eq', values: ['completed'] },
            ],
            predicateMode: 'bestEffort',
        });
        expect(descriptor.rowCount).toBe(2);
        expect(descriptor.pushedPredicates).toHaveLength(1);
    });

    it('refuses exact mode when a predicate cannot be pushed', async () => {
        await expect(
            buildClient().scan({
                table: 'orders',
                predicates: [
                    { column: 'amount', operator: 'gt', values: [15] },
                ],
                predicateMode: 'exact',
            }),
        ).rejects.toThrow(`(${JsonRpcErrorCodes.PREDICATES_NOT_SATISFIABLE})`);
    });

    it('serves best-effort mode for the same unpushable predicate', async () => {
        const descriptor = await buildClient().scan({
            table: 'orders',
            predicates: [{ column: 'amount', operator: 'gt', values: [15] }],
            predicateMode: 'bestEffort',
        });
        // Nothing pushed: full table comes back, consumer re-applies
        expect(descriptor.pushedPredicates).toHaveLength(0);
        expect(descriptor.rowCount).toBe(3);
    });

    it('rejects undeclared methods with the capability error code', async () => {
        await expect(
            buildClient().query({ dialect: 'sql:duckdb', query: 'SELECT 1' }),
        ).rejects.toThrow(`(${JsonRpcErrorCodes.CAPABILITY_NOT_SUPPORTED})`);
    });

    it('maps TdcpError from handlers onto its protocol code', async () => {
        await expect(
            buildClient().read({ table: 'nope' }),
        ).rejects.toThrow(`(${JsonRpcErrorCodes.DATASET_NOT_FOUND})`);
    });
});
