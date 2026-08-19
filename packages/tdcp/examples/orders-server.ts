/**
 * A complete TDCP server, handlers only: two CRM tables, tier 0 (`read`),
 * tier 1 (`scan` with equality/IN pushdown), and the smallest possible
 * tier 2 dialect (`table:name`). The dataset lifecycle (handles, tokens,
 * expiry) is TdcpDatasetStore's job; the transport is startTdcpNodeServer;
 * every protocol guarantee comes from createTdcpRequestHandler.
 *
 * Run: npx tsx packages/tdcp/examples/orders-server.ts [port]
 */
import {
    createTdcpRequestHandler,
    JsonRpcErrorCodes,
    TdcpDatasetStore,
    TdcpError,
    type TdcpCatalog,
} from '../src';
import { startTdcpNodeServer } from '../src/nodeHttp';

const PORT = Number(process.argv[2] ?? 4832);

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
            columns: ['account_id', 'name', 'tier', 'csm'].map((name) => ({
                name,
                type: 'string',
                label: null,
                description: null,
            })),
        },
        {
            reference: 'crm_touchpoints',
            label: 'CRM touchpoints',
            description: 'Outbound touches per account',
            columns: ['account_id', 'channel', 'touched_at'].map((name) => ({
                name,
                type: 'string',
                label: null,
                description: null,
            })),
        },
    ],
};

const store = new TdcpDatasetStore({
    baseUrl: `http://127.0.0.1:${PORT}`,
});

const requireTable = (reference: string) => {
    const rows = TABLES[reference];
    const schema = CATALOG.tables.find(
        (table) => table.reference === reference,
    )?.columns;
    if (!rows || !schema) {
        throw new TdcpError(
            JsonRpcErrorCodes.DATASET_NOT_FOUND,
            `Unknown table "${reference}" — see tabular/catalog`,
        );
    }
    return { rows, schema };
};

const handler = createTdcpRequestHandler({
    catalog: async () => CATALOG,
    // Tier 2 with the simplest possible dialect: the query text is a table
    // name. A source's "own language" can be this small.
    queryDialects: ['table:name'],
    query: async (_ctx, request) => {
        const { rows, schema } = requireTable(request.query.trim());
        return store.mint({ schema, rows: rows.slice(0, request.limit) });
    },
    read: async (_ctx, request) => {
        const { rows, schema } = requireTable(request.table);
        return store.mint({ schema, rows: rows.slice(0, request.limit) });
    },
    scan: async (_ctx, request) => {
        const { rows, schema } = requireTable(request.table);
        // Equality and IN push down; anything else is left to the consumer
        const pushable = (request.predicates ?? []).filter(
            (p) => p.operator === 'eq' || p.operator === 'in',
        );
        let filtered = rows.filter((row) =>
            pushable.every((p) => p.values.includes(row[p.column] as string)),
        );
        if (request.columns) {
            const keep = new Set(request.columns);
            filtered = filtered.map((row) =>
                Object.fromEntries(
                    Object.entries(row).filter(([key]) => keep.has(key)),
                ),
            );
        }
        return store.mint({
            schema,
            rows: filtered.slice(0, request.limit),
            pushedPredicates: pushable,
        });
    },
});

startTdcpNodeServer({
    handler,
    store,
    port: PORT,
    resolveContext: () => undefined,
}).then(({ url }) => {
    // eslint-disable-next-line no-console
    console.log(
        `TDCP orders server: ${url}/rpc (${CATALOG.tables.length} tables)`,
    );
});
