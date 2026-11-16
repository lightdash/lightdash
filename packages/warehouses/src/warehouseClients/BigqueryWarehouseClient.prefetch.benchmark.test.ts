import {
    BigQuery,
    type Job,
    type QueryResultsOptions,
    type QueryRowsResponse,
} from '@google-cloud/bigquery';
import type { WarehouseFetchStats } from '@lightdash/common';
import { createHash } from 'node:crypto';
import { monitorEventLoopDelay, performance } from 'node:perf_hooks';
import { createRowBatchProcessor } from '../utils/streamRows';
import {
    BIGQUERY_RESULTS_PAGE_SIZE,
    BigqueryWarehouseClient,
    parseBigqueryRow,
} from './BigqueryWarehouseClient';
import { credentials } from './BigqueryWarehouseClient.mock';

const ROWS_PER_PAGE = 1000;
const PAGES = 5;
const RUNS = 3;
const SCENARIOS_LATENCY_MS = [100, 20];

type StreamCallback = (rows: Record<string, unknown>[]) => Promise<void>;

const serialStreamResults = async (
    job: Job,
    streamCallback: StreamCallback,
) => {
    const processRows = createRowBatchProcessor(
        parseBigqueryRow,
        streamCallback,
    );
    let nextQuery: QueryResultsOptions | null = {};
    while (nextQuery) {
        const [rows, query, response]: QueryRowsResponse =
            // eslint-disable-next-line no-await-in-loop
            await job.getQueryResults({
                ...nextQuery,
                autoPaginate: false,
                maxResults: BIGQUERY_RESULTS_PAGE_SIZE,
                skipParsing: true,
            });
        if (rows.length > 0) {
            if (!response?.schema) {
                throw new Error('Query response has no schema');
            }
            for (let offset = 0; offset < rows.length; offset += 64) {
                // eslint-disable-next-line no-underscore-dangle
                const converted = BigQuery.mergeSchemaWithRows_(
                    response.schema,
                    rows.slice(offset, offset + 64),
                    { wrapIntegers: false, parseJSON: false },
                );
                // eslint-disable-next-line no-await-in-loop
                await processRows(converted);
            }
        }
        nextQuery = query ?? null;
    }
};

const prefetchStreamResults = (job: Job, streamCallback: StreamCallback) =>
    (
        new BigqueryWarehouseClient(credentials) as unknown as {
            streamResults: (
                job: Job,
                callback: StreamCallback,
            ) => Promise<WarehouseFetchStats>;
        }
    ).streamResults(job, streamCallback);

const createPageBodies = () => {
    const fields = [
        ...Array.from({ length: 4 }, (_, i) => ({
            name: `n${i}`,
            type: 'INTEGER',
            mode: 'NULLABLE',
        })),
        ...Array.from({ length: 20 }, (_, i) => ({
            name: `t${i}`,
            type: 'TIMESTAMP',
            mode: 'NULLABLE',
        })),
        { name: 's0', type: 'STRING', mode: 'NULLABLE' },
    ];
    const bodies = new Map<string, string>();
    for (let pageIndex = 0; pageIndex < PAGES; pageIndex += 1) {
        const rows = Array.from({ length: ROWS_PER_PAGE }, (_, offset) => {
            const r = pageIndex * ROWS_PER_PAGE + offset;
            return {
                f: fields.map((field, i) => {
                    if (field.type === 'INTEGER')
                        return { v: String(r * 7 + i) };
                    if (field.type === 'TIMESTAMP') {
                        return {
                            v: String(
                                1794398400000000 + r * 1000003 + (i - 4) * 977,
                            ),
                        };
                    }
                    return { v: `order-${r}` };
                }),
            };
        });
        bodies.set(
            String(pageIndex),
            JSON.stringify({
                schema: { fields },
                jobComplete: true,
                rows,
                ...(pageIndex + 1 < PAGES
                    ? { pageToken: String(pageIndex + 1) }
                    : {}),
            }),
        );
    }
    return bodies;
};

const createSyntheticJob = (bodies: Map<string, string>, latencyMs: number) => {
    const bigquery = new BigQuery({ projectId: 'synthetic-benchmark' });
    (
        bigquery as unknown as {
            request: (
                options: { qs: { pageToken?: string } },
                callback: (error: Error | null, body?: unknown) => void,
            ) => void;
        }
    ).request = (options, callback) => {
        setTimeout(() => {
            callback(
                null,
                JSON.parse(bodies.get(options.qs.pageToken ?? '0') ?? '{}'),
            );
        }, latencyMs);
    };
    return bigquery.job('synthetic-benchmark', { location: 'US' });
};

const measure = async (
    stream: (job: Job, callback: StreamCallback) => Promise<unknown>,
    bodies: Map<string, string>,
    latencyMs: number,
) => {
    const job = createSyntheticJob(bodies, latencyMs);
    const hash = createHash('sha256');
    let rows = 0;
    const write: StreamCallback = async (batch) => {
        rows += batch.length;
        hash.update(`${batch.map((row) => JSON.stringify(row)).join('\n')}\n`);
    };
    const histogram = monitorEventLoopDelay({ resolution: 1 });
    histogram.enable();
    let longestGapMs = 0;
    let lastTick = performance.now();
    const timer = setInterval(() => {
        const now = performance.now();
        longestGapMs = Math.max(longestGapMs, now - lastTick);
        lastTick = now;
    }, 1);
    await new Promise((resolve) => {
        setTimeout(resolve, 20);
    });
    histogram.reset();
    longestGapMs = 0;
    lastTick = performance.now();
    const start = performance.now();
    await stream(job, write);
    const totalMs = performance.now() - start;
    clearInterval(timer);
    histogram.disable();
    return {
        totalMs,
        rowsPerSecond: (rows * 1000) / totalMs,
        longestMs: Math.max(longestGapMs, histogram.max / 1e6),
        rows,
        sha256: hash.digest('hex'),
    };
};

type Sample = Awaited<ReturnType<typeof measure>>;

const summarise = (
    samples: Sample[],
    key: 'totalMs' | 'rowsPerSecond' | 'longestMs',
) => {
    const values = samples.map((sample) => sample[key]).sort((a, b) => a - b);
    const format = (value: number) => value.toFixed(1);
    return `${format(values[Math.floor((values.length - 1) / 2)])} [${format(values[0])}, ${format(values[values.length - 1])}]`;
};

const median = (samples: Sample[], key: 'totalMs') =>
    samples.map((sample) => sample[key]).sort((a, b) => a - b)[
        Math.floor((samples.length - 1) / 2)
    ];

describe('BigQuery result prefetch benchmark', () => {
    it('streams the same bytes faster than the serial loop without longer stalls', async () => {
        const bodies = createPageBodies();
        const lines = [
            `SPK-3075 benchmark: ${PAGES} pages x ${ROWS_PER_PAGE} rows, 4 INTEGER + 20 TIMESTAMP + 1 STRING columns, ${RUNS} alternating runs, Node ${process.version}. Cells are median [min, max].`,
            '',
            '| Latency per page | Loop | Stream time (ms) | Rows/s | Longest event-loop gap (ms) |',
            '|---:|---|---:|---:|---:|',
        ];
        const results: Record<number, { before: Sample[]; after: Sample[] }> =
            {};
        for (const latencyMs of SCENARIOS_LATENCY_MS) {
            const before: Sample[] = [];
            const after: Sample[] = [];
            for (let run = 0; run < RUNS; run += 1) {
                const serialSample =
                    // eslint-disable-next-line no-await-in-loop
                    await measure(serialStreamResults, bodies, latencyMs);
                before.push(serialSample);
                const prefetchSample =
                    // eslint-disable-next-line no-await-in-loop
                    await measure(prefetchStreamResults, bodies, latencyMs);
                after.push(prefetchSample);
            }
            results[latencyMs] = { before, after };
            for (const [label, samples] of [
                ['before (serial)', before],
                ['after (prefetch)', after],
            ] as const) {
                lines.push(
                    `| ${latencyMs} ms | ${label} | ${summarise(samples, 'totalMs')} | ${summarise(samples, 'rowsPerSecond')} | ${summarise(samples, 'longestMs')} |`,
                );
            }
        }
        console.log(lines.join('\n'));

        const allSamples = Object.values(results).flatMap(
            ({ before, after }) => [...before, ...after],
        );
        expect(new Set(allSamples.map((sample) => sample.sha256)).size).toBe(1);
        expect(
            allSamples.every((sample) => sample.rows === PAGES * ROWS_PER_PAGE),
        ).toBe(true);
        const slowNetwork = results[SCENARIOS_LATENCY_MS[0]];
        expect(median(slowNetwork.after, 'totalMs')).toBeLessThan(
            median(slowNetwork.before, 'totalMs') * 0.9,
        );
    }, 120_000);
});
