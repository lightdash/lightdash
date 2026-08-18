/**
 * A complete tier 0/1 TDCP server in one file: three tables of demo CRM
 * data, JSON-RPC control plane, JSONL data plane, bearer-checked links.
 * This is the "weekend integrator" experience the SDK promises — the
 * integrator writes catalog/read/scan handlers; every protocol guarantee
 * (exact-mode refusal, capability errors, links on descriptors) comes from
 * createTdcpRequestHandler.
 *
 * Run: npx tsx packages/tdcp/examples/orders-server.ts [port]
 */
import { createServer } from 'http';
import {
    createTdcpRequestHandler,
    JsonRpcErrorCodes,
    jsonRpcError,
    TdcpError,
    type JsonRpcRequest,
    type TdcpCatalog,
    type TdcpDataLink,
    type TdcpDatasetDescriptor,
    type TdcpScanPredicate,
} from '../src';

const PORT = Number(process.argv[2] ?? 4832);
const BASE_URL = `http://127.0.0.1:${PORT}`;

// ---------------------------------------------------------------- fixture
const TABLES: Record<string, Record<string, unknown>[]> = {
    crm_accounts: [
        {
            account_id: 'a1',
            name: 'Meridian Labs',
            tier: 'enterprise',
            csm: 'sam',
        },
        {
            account_id: 'a2',
            name: 'Harbor Analytics',
            tier: 'growth',
            csm: 'ana',
        },
        { account_id: 'a3', name: 'Northwind Ops', tier: 'growth', csm: 'sam' },
        {
            account_id: 'a4',
            name: 'Quartz Metrics',
            tier: 'starter',
            csm: 'ana',
        },
    ],
    crm_touchpoints: [
        { account_id: 'a1', channel: 'call', touched_at: '2026-08-01' },
        { account_id: 'a2', channel: 'email', touched_at: '2026-08-03' },
        { account_id: 'a2', channel: 'call', touched_at: '2026-08-10' },
        { account_id: 'a3', channel: 'email', touched_at: '2026-08-12' },
    ],
};

const CATALOG: TdcpCatalog = {
    tables: [
        {
            reference: 'crm_accounts',
            label: 'CRM accounts',
            description: 'Accounts from the demo CRM',
            columns: [
                {
                    name: 'account_id',
                    type: 'string',
                    label: null,
                    description: null,
                },
                {
                    name: 'name',
                    type: 'string',
                    label: null,
                    description: null,
                },
                {
                    name: 'tier',
                    type: 'string',
                    label: null,
                    description: null,
                },
                { name: 'csm', type: 'string', label: null, description: null },
            ],
        },
        {
            reference: 'crm_touchpoints',
            label: 'CRM touchpoints',
            description: 'Outbound touches per account',
            columns: [
                {
                    name: 'account_id',
                    type: 'string',
                    label: null,
                    description: null,
                },
                {
                    name: 'channel',
                    type: 'string',
                    label: null,
                    description: null,
                },
                {
                    name: 'touched_at',
                    type: 'string',
                    label: null,
                    description: null,
                },
            ],
        },
    ],
};

// -------------------------------------------------------- dataset store
const datasets = new Map<
    string,
    { rows: Record<string, unknown>[]; token: string }
>();
let mintCounter = 0;

const mintDataset = (
    table: string,
    rows: Record<string, unknown>[],
    pushedPredicates?: TdcpScanPredicate[],
): TdcpDatasetDescriptor => {
    mintCounter += 1;
    const datasetId = `ds_${mintCounter}`;
    const token = `tok_${Math.random().toString(36).slice(2)}`;
    datasets.set(datasetId, { rows, token });
    const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
    const link: TdcpDataLink = {
        encoding: 'jsonl',
        href: `${BASE_URL}/data/${datasetId}`,
        token,
        expiresAt,
    };
    const schema =
        CATALOG.tables.find((t) => t.reference === table)?.columns ?? [];
    return {
        datasetId,
        schema,
        rowCount: rows.length,
        producedAt: new Date().toISOString(),
        expiresAt,
        freshness: {
            sourceQueriedAt: new Date().toISOString(),
            cacheHit: false,
        },
        links: [link],
        ...(pushedPredicates ? { pushedPredicates } : {}),
    };
};

const requireTable = (table: string): Record<string, unknown>[] => {
    const rows = TABLES[table];
    if (!rows) {
        throw new TdcpError(
            JsonRpcErrorCodes.DATASET_NOT_FOUND,
            `Unknown table "${table}" — see tabular/catalog`,
        );
    }
    return rows;
};

// ------------------------------------------------------------- handlers
const handler = createTdcpRequestHandler({
    catalog: async () => CATALOG,
    // Tier 2 with the simplest possible dialect: the query text is a table
    // name. A source's "own language" can be this small.
    queryDialects: ['table:name'],
    query: async (_ctx, request) => {
        const table = request.query.trim();
        return mintDataset(table, requireTable(table).slice(0, request.limit));
    },
    read: async (_ctx, request) =>
        mintDataset(
            request.table,
            requireTable(request.table).slice(0, request.limit),
        ),
    scan: async (_ctx, request) => {
        // Equality and IN push down; anything else is left to the consumer
        const pushable = (request.predicates ?? []).filter(
            (p) => p.operator === 'eq' || p.operator === 'in',
        );
        let rows = requireTable(request.table).filter((row) =>
            pushable.every((p) => p.values.includes(row[p.column] as string)),
        );
        if (request.columns) {
            const keep = new Set(request.columns);
            rows = rows.map((row) =>
                Object.fromEntries(
                    Object.entries(row).filter(([k]) => keep.has(k)),
                ),
            );
        }
        return mintDataset(
            request.table,
            rows.slice(0, request.limit),
            pushable,
        );
    },
});

// ------------------------------------------------------------ transport
createServer(async (req, res) => {
    try {
        if (req.method === 'POST' && req.url === '/rpc') {
            const chunks: Buffer[] = [];
            for await (const chunk of req) chunks.push(chunk as Buffer);
            let request: JsonRpcRequest;
            try {
                request = JSON.parse(Buffer.concat(chunks).toString('utf8'));
            } catch (e) {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(
                    JSON.stringify(
                        jsonRpcError(
                            null,
                            JsonRpcErrorCodes.PARSE_ERROR,
                            'Invalid JSON',
                        ),
                    ),
                );
                return;
            }
            const response = await handler(request, undefined);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(response));
            return;
        }
        const dataMatch = req.url?.match(/^\/data\/(ds_\d+)$/);
        if (req.method === 'GET' && dataMatch) {
            const dataset = datasets.get(dataMatch[1]);
            const bearer = req.headers.authorization?.replace('Bearer ', '');
            if (!dataset || bearer !== dataset.token) {
                res.writeHead(dataset ? 401 : 404).end();
                return;
            }
            res.writeHead(200, { 'Content-Type': 'application/jsonl' });
            for (const row of dataset.rows)
                res.write(`${JSON.stringify(row)}\n`);
            res.end();
            return;
        }
        res.writeHead(404).end();
    } catch (e) {
        res.writeHead(500).end();
    }
}).listen(PORT, '127.0.0.1', () => {
    // eslint-disable-next-line no-console
    console.log(
        `TDCP orders server: ${BASE_URL}/rpc (${CATALOG.tables.length} tables)`,
    );
});
