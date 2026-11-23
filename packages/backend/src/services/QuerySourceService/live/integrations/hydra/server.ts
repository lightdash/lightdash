import {
    HYDRA_ACCOUNT_PATH,
    HYDRA_REPORT_PATH,
    type HydraApiSource,
    type HydraRateLimits,
    type HydraScriptStep,
} from '@lightdash/common';
import { z } from 'zod';
import type { LiveHttpRequest, LiveHttpResponse } from '../../types';
import {
    buildHydraDataset,
    getHydraAccountId,
    type HydraDataset,
} from './data';
import { hydraReportSchema, runHydraReport } from './report';

/** The most groups one report returns, as a vendor's page size would. */
export const HYDRA_REPORT_MAX_ROWS = 10_000;

/** One call to Hydra's API, with the source's settings and sign-in token. */
export type HydraCall = {
    /** Keeps call numbers, limit windows and stats per source. */
    sourceKey: string;
    settings: HydraApiSource;
    token: string | null;
    request: Pick<LiveHttpRequest, 'method' | 'path' | 'body'>;
    /** A call whose wait reaches this throws HydraTimeoutError after it. */
    timeoutMs?: number;
};

/** What Hydra saw of one source's calls, for tests of the rate-limit gate. */
export type HydraStats = {
    /** Every call that reached the API, refused ones included. */
    calls: number;
    /** Calls refused for crossing the vendor limits. */
    refused: number;
    /** The most calls running at once. */
    maxInFlight: number;
    /** The shortest gap between two accepted calls; null before the second. */
    minGapMs: number | null;
    /** The most calls one window of each bucket accepted. */
    peakPerBucket: Record<string, number>;
};

type HydraServerOptions = {
    now?: () => Date;
    sleep?: (ms: number) => Promise<void>;
    random?: () => number;
};

type Bucket = HydraRateLimits['buckets'][number];

type SourceState = {
    callNumber: number;
    inFlight: number;
    lastAcceptedAt: number | null;
    /**
     * Calls accepted in each bucket's open window. A window opens at the
     * first call after the last one closed, as the rate-limit gate's do.
     */
    windows: Map<string, { startedAt: number; count: number }>;
    stats: HydraStats;
};

const json = (
    status: number,
    responseBody: unknown,
    headers: Record<string, string> = {},
): LiveHttpResponse => ({
    status,
    headers: { 'content-type': 'application/json', ...headers },
    body: responseBody,
});

// Where a page starts rides on the report body; the report itself is strict
const pageSchema = z
    .object({ offset: z.number().int().min(0).default(0) })
    .passthrough();

const DATASET_CACHE_SIZE = 20;
// A call refused for concurrency may retry this soon
const BUSY_RETRY_MS = 1_000;

const newSourceState = (): SourceState => ({
    callNumber: 0,
    inFlight: 0,
    lastAcceptedAt: null,
    windows: new Map(),
    stats: {
        calls: 0,
        refused: 0,
        maxInFlight: 0,
        minGapMs: null,
        peakPerBucket: {},
    },
});

/** The vendor's windows: its buckets, plus one of a second for `callsPerSecond`. */
const getBuckets = (limits: HydraRateLimits): Bucket[] => [
    ...(limits.callsPerSecond
        ? [{ id: 'second', windowMs: 1_000, capacity: limits.callsPerSecond }]
        : []),
    ...limits.buckets,
];

const matchesStep = ({ calls }: HydraScriptStep, callNumber: number) => {
    const [from, to] = calls.split('-');
    if (to === undefined) return callNumber === Number(from);
    return (
        callNumber >= Number(from) && (to === '' || callNumber <= Number(to))
    );
};

/** A call Hydra let run past the source's timeout; the caller fails it. */
export class HydraTimeoutError extends Error {}

/**
 * Hydra's API, answered in-process: nothing goes over the network. Each call
 * is refused past the vendor limits, then waits, fails or answers as the
 * source's settings and script say, reading rows seeded from its token.
 */
export const createHydraServer = ({
    now = () => new Date(),
    sleep = (ms) =>
        new Promise((resolve) => {
            setTimeout(resolve, ms);
        }),
    random = Math.random,
}: HydraServerOptions = {}) => {
    const sources = new Map<string, SourceState>();
    const datasets = new Map<string, HydraDataset>();

    const getSource = (sourceKey: string) => {
        const existing = sources.get(sourceKey);
        if (existing) return existing;
        const created = newSourceState();
        sources.set(sourceKey, created);
        return created;
    };

    const getDataset = (token: string, rowCount: number) => {
        const today = now().toISOString().slice(0, 10);
        const key = JSON.stringify([token, rowCount, today]);
        const cached = datasets.get(key);
        if (cached) return cached;
        const dataset = buildHydraDataset({ token, rowCount, today });
        if (datasets.size >= DATASET_CACHE_SIZE) {
            datasets.delete(datasets.keys().next().value as string);
        }
        datasets.set(key, dataset);
        return dataset;
    };

    const getOpenWindow = (
        source: SourceState,
        bucket: Bucket,
        time: number,
    ) => {
        const window = source.windows.get(bucket.id);
        return window && time < window.startedAt + bucket.windowMs
            ? window
            : null;
    };

    /** When the limit that refuses this call frees up; null to accept it. */
    const getRefusedUntil = (
        source: SourceState,
        limits: HydraRateLimits,
        time: number,
    ): number | null => {
        if (
            limits.concurrentCalls !== null &&
            source.inFlight >= limits.concurrentCalls
        ) {
            return time + BUSY_RETRY_MS;
        }
        const resets = getBuckets(limits).flatMap((bucket) => {
            const window = getOpenWindow(source, bucket, time);
            return window && window.count >= bucket.capacity
                ? [window.startedAt + bucket.windowMs]
                : [];
        });
        return resets.length > 0 ? Math.max(...resets) : null;
    };

    const accept = (
        source: SourceState,
        limits: HydraRateLimits | null,
        time: number,
    ) => {
        const { stats } = source;
        (limits ? getBuckets(limits) : []).forEach((bucket) => {
            const window = getOpenWindow(source, bucket, time);
            const opened = window ?? { startedAt: time, count: 0 };
            opened.count += 1;
            source.windows.set(bucket.id, opened);
            stats.peakPerBucket[bucket.id] = Math.max(
                stats.peakPerBucket[bucket.id] ?? 0,
                opened.count,
            );
        });
        if (source.lastAcceptedAt !== null) {
            const gap = time - source.lastAcceptedAt;
            stats.minGapMs = Math.min(stats.minGapMs ?? gap, gap);
        }
        // eslint-disable-next-line no-param-reassign
        source.lastAcceptedAt = time;
        // eslint-disable-next-line no-param-reassign
        source.inFlight += 1;
        stats.maxInFlight = Math.max(stats.maxInFlight, source.inFlight);
    };

    const refuse = (
        { onLimit }: HydraApiSource,
        time: number,
        refusedUntil: number,
    ): LiveHttpResponse => {
        const headers: Record<string, string> = {};
        if (onLimit.retryAfter === 'seconds') {
            headers['retry-after'] = String(
                Math.max(1, Math.ceil((refusedUntil - time) / 1_000)),
            );
        } else if (onLimit.retryAfter === 'date') {
            headers['retry-after'] = new Date(refusedUntil).toUTCString();
        }
        return json(
            onLimit.status,
            onLimit.body ?? { message: 'Too many requests' },
            headers,
        );
    };

    const answer = (
        settings: HydraApiSource,
        token: string,
        request: HydraCall['request'],
    ): LiveHttpResponse => {
        const dataset = getDataset(token, settings.rowCount);
        if (request.method === 'GET' && request.path === HYDRA_ACCOUNT_PATH) {
            return json(200, {
                account: getHydraAccountId(token),
                events: dataset.events.length,
                users: dataset.users.length,
            });
        }
        if (request.method === 'POST' && request.path === HYDRA_REPORT_PATH) {
            const page = pageSchema.safeParse(request.body);
            const { offset, ...report } = page.success
                ? page.data
                : { offset: 0 };
            const parsed = hydraReportSchema.safeParse(
                page.success ? report : request.body,
            );
            if (!parsed.success) {
                return json(400, {
                    message: parsed.error.issues
                        .map(({ message }) => message)
                        .join('; '),
                });
            }
            const rows = runHydraReport(dataset, parsed.data);
            const limit = Math.min(
                parsed.data.limit ?? HYDRA_REPORT_MAX_ROWS,
                HYDRA_REPORT_MAX_ROWS,
                rows.length,
            );
            const end = Math.min(offset + (settings.pageSize || limit), limit);
            return json(200, {
                rows: rows.slice(offset, end),
                totalRows: rows.length,
                nextOffset: end < limit ? end : null,
            });
        }
        return json(404, {
            message: `No ${request.method} ${request.path} on Hydra`,
        });
    };

    const call = async (
        source: SourceState,
        { settings, token, request, timeoutMs = Infinity }: HydraCall,
    ): Promise<LiveHttpResponse> => {
        const callNumber = source.callNumber + 1;
        // eslint-disable-next-line no-param-reassign
        source.callNumber = callNumber;
        // eslint-disable-next-line no-param-reassign
        source.stats.calls += 1;

        // The vendor refuses at once, before doing any work
        const arrivedAt = now().getTime();
        const { vendorLimits } = settings;
        const refusedUntil = vendorLimits
            ? getRefusedUntil(source, vendorLimits, arrivedAt)
            : null;
        if (refusedUntil !== null) {
            // eslint-disable-next-line no-param-reassign
            source.stats.refused += 1;
            return refuse(settings, arrivedAt, refusedUntil);
        }

        accept(source, vendorLimits, arrivedAt);
        try {
            const waitMs =
                settings.latencyMs + Math.floor(random() * settings.jitterMs);
            if (waitMs >= timeoutMs) {
                await sleep(timeoutMs);
                throw new HydraTimeoutError(
                    `Hydra did not answer within ${timeoutMs}ms`,
                );
            }
            if (waitMs > 0) await sleep(waitMs);

            const step = settings.script.find((candidate) =>
                matchesStep(candidate, callNumber),
            );
            if (step && step.respond !== 'ok') {
                const { status, retryAfterSeconds, body } = step.respond;
                return json(
                    status,
                    body ?? {
                        message: `Scripted ${status} on call ${callNumber}`,
                    },
                    retryAfterSeconds === undefined
                        ? {}
                        : { 'retry-after': String(retryAfterSeconds) },
                );
            }
            if (settings.failAuth || !token) {
                return json(401, {
                    message: 'The sign-in token was rejected',
                });
            }
            if (!step && random() < settings.errorRate) {
                return json(500, { message: 'Injected server error' });
            }
            return answer(settings, token, request);
        } finally {
            // eslint-disable-next-line no-param-reassign
            source.inFlight -= 1;
        }
    };

    const fetch = async (hydraCall: HydraCall): Promise<LiveHttpResponse> =>
        call(getSource(hydraCall.sourceKey), hydraCall);

    return {
        fetch,
        /** What Hydra saw of one source's calls; counts are per backend process. */
        getStats: (sourceKey: string): HydraStats =>
            structuredClone(getSource(sourceKey).stats),
        /** Forgets call numbers, windows and stats, for one source or all. */
        reset: (sourceKey?: string) => {
            if (sourceKey === undefined) sources.clear();
            else sources.delete(sourceKey);
        },
    };
};

export type HydraServer = ReturnType<typeof createHydraServer>;

/** The server every Hydra source on this backend calls. */
export const hydraServer = createHydraServer();
