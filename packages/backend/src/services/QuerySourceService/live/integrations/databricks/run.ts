import {
    DATABRICKS_STATEMENTS_PATH,
    DimensionType,
    ParameterError,
    TimeoutError,
    TooManyRequestsError,
    UnexpectedServerError,
    WarehouseConnectionError,
    WarehouseQueryError,
    type ApiConnectorType,
    type ApiSourceOf,
} from '@lightdash/common';
import { z } from 'zod';
import { assertMaxRows } from '../../integration';
import {
    type LiveCalls,
    type LiveColumn,
    type LiveHttpResponse,
    type LiveRunArgs,
    type LiveRunResult,
    type LiveTestSummary,
} from '../../types';

type DatabricksSettings = ApiSourceOf<ApiConnectorType.DATABRICKS>;

/** Inline results stop at 25 MiB a statement; this many rows stays well under. */
export const DATABRICKS_MAX_QUERY_ROWS = 50_000;
/** The longest the submit call may wait for a result (Databricks allows 5 to 50 seconds). */
const WAIT_TIMEOUT = '50s';
/** Polls after the wait, for warehouses that are starting or queued. */
export const DATABRICKS_MAX_POLLS = 20;
export const DATABRICKS_POLL_MS = 2_000;
/** Result chunks read after the first, past which the rows are cut. */
export const DATABRICKS_MAX_CHUNKS = 8;
/** Submit, polls, chunks and one cancel. */
export const DATABRICKS_CALLS_PER_QUERY =
    1 + DATABRICKS_MAX_POLLS + DATABRICKS_MAX_CHUNKS + 1;

const COLUMN_NAME = /^[A-Za-z_][A-Za-z0-9_]{0,254}$/;
// A read starts with SELECT, WITH or VALUES, but WITH can lead into a write;
// checked outside string literals and comments
const WRITE_STATEMENT =
    /\b(insert|update|delete|merge|drop|create|alter|truncate|grant|revoke)\b/i;
const READ_STATEMENT = /^\s*(\(\s*)*(select|with|values)\b/i;

const chunkSchema = z.object({
    data_array: z.array(z.array(z.string().nullable())).nullish(),
    next_chunk_internal_link: z.string().nullish(),
});

const statementSchema = z.object({
    statement_id: z.string(),
    status: z.object({
        state: z.enum([
            'PENDING',
            'RUNNING',
            'SUCCEEDED',
            'FAILED',
            'CANCELED',
            'CLOSED',
        ]),
        error: z
            .object({
                error_code: z.string().nullish(),
                message: z.string().nullish(),
            })
            .nullish(),
    }),
    manifest: z
        .object({
            schema: z.object({
                columns: z
                    .array(
                        z.object({
                            name: z.string(),
                            type_name: z.string().nullish(),
                            position: z.number(),
                        }),
                    )
                    .nullish(),
            }),
            truncated: z.boolean().nullish(),
        })
        .nullish(),
    result: chunkSchema.nullish(),
});

type Statement = z.infer<typeof statementSchema>;

const errorSchema = z.object({
    error_code: z.string().optional(),
    message: z.string().optional(),
});

const warehouseSchema = z.object({
    name: z.string(),
    state: z.string().optional(),
    cluster_size: z.string().optional(),
});

const sleep = (ms: number) =>
    new Promise<void>((resolve) => {
        setTimeout(resolve, ms);
    });

export const getDatabricksStatementPath = (statementId: string) =>
    `${DATABRICKS_STATEMENTS_PATH}/${statementId}`;

export const databricksTypeToDimensionType = (
    typeName: string | null | undefined,
): DimensionType => {
    switch (typeName) {
        case 'BYTE':
        case 'SHORT':
        case 'INT':
        case 'LONG':
        case 'FLOAT':
        case 'DOUBLE':
        case 'DECIMAL':
            return DimensionType.NUMBER;
        case 'BOOLEAN':
            return DimensionType.BOOLEAN;
        case 'DATE':
            return DimensionType.DATE;
        case 'TIMESTAMP':
        case 'TIMESTAMP_NTZ':
            return DimensionType.TIMESTAMP;
        default:
            return DimensionType.STRING;
    }
};

// JSON_ARRAY results send every value as a string, and nulls as null
const toResultValue = (value: string | null, type: DimensionType): unknown => {
    if (value === null) return null;
    if (type === DimensionType.NUMBER) return Number(value);
    if (type === DimensionType.BOOLEAN) return value === 'true';
    return value;
};

/** Reads one read-only statement, dropping trailing semicolons. */
export const parseDatabricksQuery = (query: string): string => {
    const sql = query.trim().replace(/;+\s*$/, '');
    if (sql.length === 0) {
        throw new ParameterError('The Databricks SQL statement is empty');
    }
    const outsideStrings = sql
        .replace(/'(?:[^'\\]|\\.)*'/g, "''")
        .replace(/--[^\n]*/g, '')
        .replace(/\/\*[\s\S]*?\*\//g, '');
    if (
        !READ_STATEMENT.test(outsideStrings) ||
        WRITE_STATEMENT.test(outsideStrings) ||
        outsideStrings.includes(';')
    ) {
        throw new ParameterError(
            'Databricks live data sources run one read-only SELECT statement',
        );
    }
    return sql;
};

const toColumns = (statement: Statement): LiveColumn[] => {
    const columns = [...(statement.manifest?.schema.columns ?? [])].sort(
        (a, b) => a.position - b.position,
    );
    const unsafe = columns
        .map(({ name }) => name)
        .filter((name) => !COLUMN_NAME.test(name));
    if (unsafe.length > 0) {
        throw new WarehouseQueryError(
            `Name every column with AS, using letters, digits and underscores: ${unsafe.join(
                ', ',
            )}`,
        );
    }
    return columns.map(({ name, type_name: typeName }) => ({
        name,
        type: databricksTypeToDimensionType(typeName),
    }));
};

const cancel = async (statementId: string, calls: LiveCalls) => {
    try {
        await calls.send({
            method: 'POST',
            path: `${getDatabricksStatementPath(statementId)}/cancel`,
            body: {},
        });
    } catch {
        // The statement still ends when its warehouse stops it
    }
};

/** Polls a statement that outlived the submit call until it ends. */
const waitForResult = async (
    submitted: Statement,
    calls: LiveCalls,
): Promise<Statement> => {
    const poll = async (statement: Statement, polls: number) => {
        const { state } = statement.status;
        if (state !== 'PENDING' && state !== 'RUNNING') {
            return statement;
        }
        if (polls >= DATABRICKS_MAX_POLLS) {
            await cancel(statement.statement_id, calls);
            throw new TimeoutError(
                'Databricks did not finish the statement in time. Check that the SQL warehouse is running, or narrow the date range.',
            );
        }
        await sleep(DATABRICKS_POLL_MS);
        const next = await calls.fetch(
            {
                method: 'GET',
                path: getDatabricksStatementPath(statement.statement_id),
                body: null,
            },
            statementSchema,
        );
        return poll(next, polls + 1);
    };
    return poll(submitted, 0);
};

/** Reads chunks after the first until `wanted` rows or the chunk cap. */
const readRows = async (
    first: z.infer<typeof chunkSchema>,
    wanted: number,
    calls: LiveCalls,
): Promise<{ rows: (string | null)[][]; hasMoreChunks: boolean }> => {
    const read = async (
        chunk: z.infer<typeof chunkSchema>,
        rows: (string | null)[][],
        chunks: number,
    ): Promise<{ rows: (string | null)[][]; hasMoreChunks: boolean }> => {
        const all = [...rows, ...(chunk.data_array ?? [])];
        const next = chunk.next_chunk_internal_link;
        if (!next || all.length >= wanted) {
            return { rows: all, hasMoreChunks: Boolean(next) };
        }
        if (chunks >= DATABRICKS_MAX_CHUNKS) {
            return { rows: all, hasMoreChunks: true };
        }
        const following = await calls.fetch(
            { method: 'GET', path: next, body: null },
            chunkSchema,
        );
        return read(following, all, chunks + 1);
    };
    return read(first, [], 0);
};

/**
 * Runs one statement on the source's SQL warehouse through the Statement
 * Execution API, asking for one row more than the limit to detect more.
 */
export const runDatabricksQuery = async ({
    settings: { warehouseId },
    request: statement,
    limit,
    calls,
}: LiveRunArgs<
    ApiConnectorType.DATABRICKS,
    string
>): Promise<LiveRunResult> => {
    assertMaxRows(limit, DATABRICKS_MAX_QUERY_ROWS);
    const submitted = await calls.fetch(
        {
            method: 'POST',
            path: DATABRICKS_STATEMENTS_PATH,
            body: {
                warehouse_id: warehouseId,
                statement,
                wait_timeout: WAIT_TIMEOUT,
                on_wait_timeout: 'CONTINUE',
                format: 'JSON_ARRAY',
                disposition: 'INLINE',
                row_limit: limit + 1,
            },
        },
        statementSchema,
    );
    const finished = await waitForResult(submitted, calls);
    if (finished.status.state !== 'SUCCEEDED') {
        const message = finished.status.error?.message;
        throw new WarehouseQueryError(
            `Databricks ${
                finished.status.state === 'FAILED'
                    ? 'could not run the statement'
                    : 'stopped the statement'
            }${message ? `: ${message}` : ''}`,
        );
    }
    const columns = toColumns(finished);
    const { rows, hasMoreChunks } = await readRows(
        finished.result ?? {},
        limit + 1,
        calls,
    );
    return {
        columns,
        rows: rows
            .slice(0, limit)
            .map((row) =>
                Object.fromEntries(
                    columns.map((column, index) => [
                        column.name,
                        toResultValue(row[index] ?? null, column.type),
                    ]),
                ),
            ),
        hasMoreRows:
            rows.length > limit ||
            hasMoreChunks ||
            Boolean(finished.manifest?.truncated),
    };
};

export const toDatabricksError = (
    response: LiveHttpResponse,
    { warehouseId }: DatabricksSettings,
): Error => {
    const parsed = errorSchema.safeParse(response.body);
    const message = parsed.success ? parsed.data.message : undefined;
    switch (response.status) {
        case 400:
            return new WarehouseQueryError(
                `Databricks rejected the statement: ${message ?? 'invalid request'}`,
            );
        case 401:
            return new WarehouseConnectionError(
                'Databricks rejected the token. Check that it has not expired and belongs to this workspace.',
            );
        case 403:
            return new WarehouseConnectionError(
                `Databricks refused access${message ? `: ${message}` : ''}. The token needs CAN USE on SQL warehouse ${warehouseId}, and SELECT on the system tables it reads.`,
            );
        case 404:
            return new WarehouseConnectionError(
                `Databricks found no SQL warehouse ${warehouseId} in this workspace, or the statement expired`,
            );
        case 429: {
            const retryAfter = Number(
                response.headers['retry-after'] ?? Number.NaN,
            );
            const retryAfterSeconds = Number.isFinite(retryAfter)
                ? retryAfter
                : null;
            return new TooManyRequestsError(
                `Databricks is rate limiting this workspace. ${
                    retryAfterSeconds !== null
                        ? `Retry after ${retryAfterSeconds} seconds.`
                        : 'Retry in a minute.'
                }`,
                { retryAfterSeconds },
            );
        }
        case 503:
            return new WarehouseConnectionError(
                `Databricks is unavailable${message ? `: ${message}` : ''}. The SQL warehouse may be starting; retry in a minute.`,
            );
        default:
            return new UnexpectedServerError(
                `Databricks returned ${response.status}${message ? `: ${message}` : ''}`,
            );
    }
};

/** The setup test reads the SQL warehouse, which proves the token reaches it. */
export const summarizeDatabricksTest = (
    body: unknown,
    { warehouseId }: DatabricksSettings,
): LiveTestSummary | null => {
    const parsed = warehouseSchema.safeParse(body);
    if (!parsed.success) return null;
    const { name, state, cluster_size: clusterSize } = parsed.data;
    return {
        summary: `Connected to SQL warehouse ${name}`,
        facts: [
            { label: 'Warehouse ID', value: warehouseId },
            ...(state ? [{ label: 'State', value: state }] : []),
            ...(clusterSize ? [{ label: 'Size', value: clusterSize }] : []),
        ],
    };
};
