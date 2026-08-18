/**
 * A directory of CSV files as a TDCP server — the files hello-world from
 * the proposal. Nothing is hardcoded: the catalog is derived from the CSV
 * headers, column types are inferred from the data, and rows are served
 * typed over the JSONL data plane. Honestly tier 0/1: a CSV is not a query
 * engine, so there is no tier 2 dialect — the consumer's compose engine
 * does the joining.
 *
 * Run: npx tsx packages/tdcp/examples/csv-server.ts [dir] [port]
 */
import { readdirSync, readFileSync } from 'fs';
import { createServer } from 'http';
import { basename, join, resolve } from 'path';
import {
    createTdcpRequestHandler,
    JsonRpcErrorCodes,
    jsonRpcError,
    TdcpError,
    type JsonRpcRequest,
    type TdcpCatalog,
    type TdcpDataLink,
    type TdcpDatasetDescriptor,
    type TdcpLogicalType,
    type TdcpScanPredicate,
} from '../src';

const DIR = resolve(process.argv[2] ?? join(__dirname, 'data'));
const PORT = Number(process.argv[3] ?? 4833);
const BASE_URL = `http://127.0.0.1:${PORT}`;

// ------------------------------------------------------------ csv parsing
/** RFC4180-ish: quoted fields, escaped quotes, no multi-line fields. */
const parseCsvLine = (line: string): string[] => {
    const cells: string[] = [];
    let cell = '';
    let quoted = false;
    for (let i = 0; i < line.length; i += 1) {
        const char = line[i];
        if (quoted) {
            if (char === '"' && line[i + 1] === '"') {
                cell += '"';
                i += 1;
            } else if (char === '"') {
                quoted = false;
            } else {
                cell += char;
            }
        } else if (char === '"') {
            quoted = true;
        } else if (char === ',') {
            cells.push(cell);
            cell = '';
        } else {
            cell += char;
        }
    }
    cells.push(cell);
    return cells;
};

const inferType = (values: string[]): TdcpLogicalType => {
    const present = values.filter((value) => value !== '');
    if (present.length === 0) return 'string';
    if (present.every((value) => /^(true|false)$/i.test(value)))
        return 'boolean';
    if (present.every((value) => !Number.isNaN(Number(value)))) return 'number';
    if (present.every((value) => /^\d{4}-\d{2}-\d{2}$/.test(value)))
        return 'date';
    if (present.every((value) => !Number.isNaN(Date.parse(value))))
        return 'timestamp';
    return 'string';
};

const coerce = (value: string, type: TdcpLogicalType): unknown => {
    if (value === '') return null;
    switch (type) {
        case 'number':
            return Number(value);
        case 'boolean':
            return value.toLowerCase() === 'true';
        default:
            return value;
    }
};

type CsvTable = {
    reference: string;
    columns: { name: string; type: TdcpLogicalType }[];
    rows: Record<string, unknown>[];
};

const loadTable = (filePath: string): CsvTable => {
    const lines = readFileSync(filePath, 'utf8')
        .split(/\r?\n/)
        .filter((line) => line.length > 0);
    const header = parseCsvLine(lines[0]);
    const raw = lines.slice(1).map(parseCsvLine);
    const columns = header.map((name, index) => ({
        name,
        type: inferType(raw.map((cells) => cells[index] ?? '')),
    }));
    const rows = raw.map((cells) =>
        Object.fromEntries(
            columns.map((column, index) => [
                column.name,
                coerce(cells[index] ?? '', column.type),
            ]),
        ),
    );
    return { reference: basename(filePath, '.csv'), columns, rows };
};

const tables = new Map(
    readdirSync(DIR)
        .filter((file) => file.endsWith('.csv'))
        .map((file) => {
            const table = loadTable(join(DIR, file));
            return [table.reference, table] as const;
        }),
);

const CATALOG: TdcpCatalog = {
    tables: Array.from(tables.values()).map((table) => ({
        reference: table.reference,
        label: table.reference,
        description: `CSV file ${table.reference}.csv`,
        columns: table.columns.map((column) => ({
            ...column,
            label: null,
            description: null,
        })),
    })),
};

// -------------------------------------------------------- dataset store
const datasets = new Map<
    string,
    { rows: Record<string, unknown>[]; token: string }
>();
let mintCounter = 0;

const mintDataset = (
    table: CsvTable,
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
    return {
        datasetId,
        schema: table.columns.map((column) => ({
            ...column,
            label: null,
            description: null,
        })),
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

const requireTable = (reference: string): CsvTable => {
    const table = tables.get(reference);
    if (!table) {
        throw new TdcpError(
            JsonRpcErrorCodes.DATASET_NOT_FOUND,
            `Unknown table "${reference}" — see tabular/catalog`,
        );
    }
    return table;
};

// ------------------------------------------------------------- handlers
const handler = createTdcpRequestHandler({
    catalog: async () => CATALOG,
    read: async (_ctx, request) => {
        const table = requireTable(request.table);
        return mintDataset(table, table.rows.slice(0, request.limit));
    },
    scan: async (_ctx, request) => {
        const table = requireTable(request.table);
        const pushable = (request.predicates ?? []).filter(
            (p) => p.operator === 'eq' || p.operator === 'in',
        );
        let rows = table.rows.filter((row) =>
            pushable.every((p) => p.values.includes(row[p.column] as string)),
        );
        if (request.columns) {
            const keep = new Set(request.columns);
            rows = rows.map((row) =>
                Object.fromEntries(
                    Object.entries(row).filter(([key]) => keep.has(key)),
                ),
            );
        }
        return mintDataset(table, rows.slice(0, request.limit), pushable);
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
        `TDCP csv server: ${BASE_URL}/rpc (${tables.size} tables from ${DIR})`,
    );
});
