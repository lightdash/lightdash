import {
    ApiConnectorType,
    DimensionType,
    ParameterError,
    STRIPE_ORIGIN,
    STRIPE_QUERY_RUNS_PATH,
    TimeoutError,
    TooManyRequestsError,
    UnexpectedServerError,
    WarehouseQueryError,
} from '@lightdash/common';
import { z } from 'zod';
import {
    assertMaxRows,
    type LiveColumn,
    type LiveRunArgs,
    type LiveRunResult,
} from '../../sdk';
import { STRIPE_MAX_QUERY_ROWS, STRIPE_PAGE_ROWS } from './api';
/**
 * Waits between checks on a running query, in milliseconds: about two
 * minutes in all. A run Stripe is still working on is reused when the same
 * SQL is sent again, so asking again later picks it up.
 */
export const STRIPE_POLL_DELAYS_MS = [
    500, 1_000, 1_000, 2_000, 2_000, 3_000, 3_000, 5_000, 5_000, 5_000, 5_000,
    5_000, 5_000, 5_000, 5_000, 10_000, 10_000, 10_000, 10_000, 10_000, 10_000,
];
/**
 * Times a query run start is sent again after Stripe says to slow down. A
 * sandbox starts one run a second, so queries started together take turns;
 * each retry waits for the hold the 429 put on Stripe's calls.
 */
export const STRIPE_START_RETRIES = 5;
/** The starts, a check per wait, and the result pages. */
export const STRIPE_CALLS_PER_QUERY =
    1 +
    STRIPE_START_RETRIES +
    STRIPE_POLL_DELAYS_MS.length +
    Math.ceil((STRIPE_MAX_QUERY_ROWS + 1) / STRIPE_PAGE_ROWS);

const TRAILING_LIMIT = /\s+LIMIT\s+(\d+)\s*$/i;
const TRAILING_SEMICOLONS = /;+\s*$/;

const inlineSchema = z.object({
    columns: z.array(z.object({ name: z.string(), type: z.string() })),
    rows: z.array(z.object({ data: z.record(z.string(), z.unknown()) })),
    next_page_url: z.string().nullish(),
});

const queryRunSchema = z.object({
    id: z.string(),
    status: z.string(),
    result: z.object({ inline: inlineSchema.optional() }).nullish(),
    status_details: z
        .object({
            code: z.string().nullish(),
            message: z.string().nullish(),
            query_errors: z.array(z.object({ message: z.string() })).nullish(),
        })
        .nullish(),
});

type StripeQueryRun = z.infer<typeof queryRunSchema>;
type StripeInline = z.infer<typeof inlineSchema>;

/** Reads one SQL query for Stripe's analytical dataset, dropping trailing semicolons. */
export const parseStripeQuery = (query: string): string => {
    const sql = query.trim().replace(TRAILING_SEMICOLONS, '');
    if (sql.length === 0) {
        throw new ParameterError('The Stripe SQL query is empty');
    }
    return sql;
};

/**
 * Caps the rows a query returns. A LIMIT is appended rather than wrapped
 * around the query, since Stripe's SQL engine drops the order of a subquery.
 */
export const withStripeRowLimit = (sql: string, rows: number) => {
    const match = TRAILING_LIMIT.exec(sql);
    return match
        ? `${sql.slice(0, match.index)}\nLIMIT ${Math.min(Number(match[1]), rows)}`
        : `${sql}\nLIMIT ${rows}`;
};

export const stripeTypeToDimensionType = (type: string): DimensionType => {
    const base = type.trim().toLowerCase();
    if (base === 'date') return DimensionType.DATE;
    if (/^(timestamp|datetime)/.test(base)) return DimensionType.TIMESTAMP;
    if (/^(bigint|integer|int|smallint|tinyint|double|real|decimal)/.test(base))
        return DimensionType.NUMBER;
    if (base === 'boolean') return DimensionType.BOOLEAN;
    return DimensionType.STRING;
};

// Inline rows carry every value as a string, so numbers and booleans are read back
const toValue = (value: unknown, type: DimensionType): unknown => {
    if (typeof value !== 'string') {
        return value !== null && typeof value === 'object'
            ? JSON.stringify(value)
            : value;
    }
    if (type === DimensionType.NUMBER) {
        const number = Number(value);
        return value.trim() !== '' && Number.isFinite(number) ? number : value;
    }
    if (type === DimensionType.BOOLEAN) {
        if (value === 'true') return true;
        if (value === 'false') return false;
    }
    return value;
};

const parseRun = (body: unknown): StripeQueryRun => {
    const parsed = queryRunSchema.safeParse(body);
    if (!parsed.success) {
        throw new UnexpectedServerError(
            'Stripe returned a query run in an unexpected shape',
        );
    }
    return parsed.data;
};

const toFailure = (run: StripeQueryRun): Error => {
    const details = run.status_details;
    const reasons = [
        details?.message,
        ...(details?.query_errors ?? []).map(({ message }) => message),
    ].filter(Boolean);
    const reason = reasons.length > 0 ? `: ${reasons.join(' ')}` : '';
    if (details?.code === 'resource_limit_exceeded') {
        return new TimeoutError(
            `Stripe stopped the query${reason}. Narrow the date range or aggregate further.`,
        );
    }
    return new WarehouseQueryError(
        run.status === 'canceled'
            ? 'Stripe canceled the query run'
            : `Stripe query failed${reason}`,
        { code: details?.code ?? null },
    );
};

/** The path and query of a next page link, which may be absolute. */
const toPageRequest = (nextPageUrl: string) => {
    const url = new URL(nextPageUrl, STRIPE_ORIGIN);
    if (
        url.origin !== STRIPE_ORIGIN ||
        !url.pathname.startsWith(STRIPE_QUERY_RUNS_PATH)
    ) {
        throw new UnexpectedServerError(
            'Stripe returned a next page link outside the query run',
        );
    }
    return {
        method: 'GET' as const,
        path: url.pathname,
        rawQuery: url.search.replace(/^\?/, ''),
        body: null,
    };
};

type Sleep = (ms: number) => Promise<void>;

const sleepFor: Sleep = (ms) =>
    new Promise((resolve) => {
        setTimeout(resolve, ms);
    });

/**
 * Runs one SQL query on Stripe's analytical dataset: starts a query run,
 * checks it until it finishes, then reads its rows inline a page at a time.
 * `sleep` is there for tests.
 */
export const createStripeRun =
    (sleep: Sleep = sleepFor) =>
    async ({
        request: sql,
        limit,
        runtime,
    }: LiveRunArgs<
        ApiConnectorType.STRIPE,
        string
    >): Promise<LiveRunResult> => {
        assertMaxRows(limit, STRIPE_MAX_QUERY_ROWS);
        const wanted = limit + 1;
        const pageRows = String(Math.min(STRIPE_PAGE_ROWS, wanted));
        const start = async (retries: number): Promise<StripeQueryRun> => {
            try {
                const response = await runtime.send({
                    method: 'POST',
                    path: STRIPE_QUERY_RUNS_PATH,
                    body: {
                        query: { sql: withStripeRowLimit(sql, wanted) },
                        dataset: 'analytical',
                        format: 'csv',
                    },
                });
                return parseRun(response.body);
            } catch (error) {
                if (!(error instanceof TooManyRequestsError) || retries === 0) {
                    throw error;
                }
                return start(retries - 1);
            }
        };
        const created = await start(STRIPE_START_RETRIES);
        const check = async (): Promise<StripeQueryRun> =>
            parseRun(
                (
                    await runtime.send({
                        method: 'GET',
                        path: `${STRIPE_QUERY_RUNS_PATH}/${encodeURIComponent(created.id)}`,
                        query: {
                            'include[0]': 'result.inline',
                            limit: pageRows,
                        },
                        body: null,
                    })
                ).body,
            );
        const waitFor = async (attempt: number): Promise<StripeQueryRun> => {
            if (attempt >= STRIPE_POLL_DELAYS_MS.length) {
                const waited = STRIPE_POLL_DELAYS_MS.reduce((a, b) => a + b, 0);
                throw new TimeoutError(
                    `Stripe is still running the query after ${Math.round(
                        waited / 1000,
                    )} seconds. Try again in a minute, or narrow the date range.`,
                );
            }
            await sleep(STRIPE_POLL_DELAYS_MS[attempt]);
            const run = await check();
            return run.status === 'running' ? waitFor(attempt + 1) : run;
        };
        const finish = (): Promise<StripeQueryRun> => {
            // A cached run comes back finished, but without its inline rows
            if (created.status === 'succeeded') return check();
            if (created.status === 'running') return waitFor(0);
            return Promise.resolve(created);
        };
        const finished = await finish();
        if (finished.status !== 'succeeded') {
            throw toFailure(finished);
        }
        const first = finished.result?.inline;
        if (!first) {
            throw new UnexpectedServerError(
                'Stripe finished the query without returning its rows',
            );
        }
        const readPages = async (
            page: StripeInline,
            rows: StripeInline['rows'],
        ): Promise<StripeInline['rows']> => {
            const all = [...rows, ...page.rows];
            if (all.length >= wanted || !page.next_page_url) return all;
            const next = await runtime.fetch(
                toPageRequest(page.next_page_url),
                z.object({
                    result: z.object({ inline: inlineSchema }),
                }),
            );
            return readPages(next.result.inline, all);
        };
        const rows = await readPages(first, []);
        const columns: LiveColumn[] = first.columns.map(({ name, type }) => ({
            name,
            type: stripeTypeToDimensionType(type),
        }));
        return {
            columns,
            rows: rows
                .slice(0, limit)
                .map(({ data }) =>
                    Object.fromEntries(
                        columns.map(({ name, type }) => [
                            name,
                            toValue(data[name] ?? null, type),
                        ]),
                    ),
                ),
            hasMoreRows: rows.length > limit,
        };
    };

export const runStripeQuery = createStripeRun();
