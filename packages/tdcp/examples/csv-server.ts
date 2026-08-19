/**
 * A directory of CSV files as a TDCP server, handlers only: catalog from
 * headers, column types inferred from the data, rows served typed. The
 * dataset lifecycle and transport come from the SDK; this file is just
 * parsing plus three handlers. Honestly tier 0/1 — a CSV is not a query
 * engine, so there is no tier 2 dialect.
 *
 * Run: npx tsx packages/tdcp/examples/csv-server.ts [dir] [port]
 */
import { readdirSync, readFileSync } from 'fs';
import { basename, join, resolve } from 'path';
import {
    createTdcpRequestHandler,
    createTdcpServer,
    JsonRpcErrorCodes,
    TdcpDatasetStore,
    TdcpError,
    type TdcpCatalog,
    type TdcpColumnSchema,
    type TdcpLogicalType,
} from '../src';
import { startTdcpNodeServer } from '../src/nodeHttp';

const DIR = resolve(process.argv[2] ?? join(__dirname, 'data'));
const PORT = Number(process.argv[3] ?? 4833);

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
    schema: TdcpColumnSchema[];
    rows: Record<string, unknown>[];
};

const loadTable = (filePath: string): CsvTable => {
    const lines = readFileSync(filePath, 'utf8')
        .split(/\r?\n/)
        .filter((line) => line.length > 0);
    const header = parseCsvLine(lines[0]);
    const raw = lines.slice(1).map(parseCsvLine);
    const schema = header.map((name, index) => ({
        name,
        type: inferType(raw.map((cells) => cells[index] ?? '')),
        label: null,
        description: null,
    }));
    const rows = raw.map((cells) =>
        Object.fromEntries(
            schema.map((column, index) => [
                column.name,
                coerce(cells[index] ?? '', column.type),
            ]),
        ),
    );
    return { reference: basename(filePath, '.csv'), schema, rows };
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
        columns: table.schema,
    })),
};

const store = new TdcpDatasetStore({ baseUrl: `http://127.0.0.1:${PORT}` });

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

const tdcpServer = createTdcpServer({
    catalog: async () => CATALOG,
    read: async (_ctx, request) => {
        const table = requireTable(request.table);
        return store.mint({
            schema: table.schema,
            rows: table.rows.slice(0, request.limit),
        });
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
        return store.mint({
            schema: table.schema,
            rows: rows.slice(0, request.limit),
            pushedPredicates: pushable,
        });
    },
});
const handler = createTdcpRequestHandler(tdcpServer);

startTdcpNodeServer({
    handler,
    store,
    port: PORT,
    resolveContext: () => undefined,
}).then(({ url }) => {
    // eslint-disable-next-line no-console
    console.log(
        `TDCP csv server: ${url}/rpc (${tables.size} tables from ${DIR})`,
    );
});
