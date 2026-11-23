import {
    HYDRA_ACCOUNT_PATH,
    HYDRA_REPORT_PATH,
    type HydraApiSource,
} from '@lightdash/common';
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
    /** Counts calls per source, for the 429 every Nth call. */
    sourceKey: string;
    settings: HydraApiSource;
    token: string | null;
    request: Pick<LiveHttpRequest, 'method' | 'path' | 'body'>;
};

type HydraServerOptions = {
    now?: () => Date;
    sleep?: (ms: number) => Promise<void>;
    random?: () => number;
};

const json = (
    status: number,
    body: unknown,
    headers: Record<string, string> = {},
): LiveHttpResponse => ({
    status,
    headers: { 'content-type': 'application/json', ...headers },
    body,
});

const DATASET_CACHE_SIZE = 20;

/**
 * Hydra's API, answered in-process: nothing goes over the network. Each call
 * waits, fails or rate limits as the source's settings say, then reads the
 * rows seeded from its sign-in token.
 */
export const createHydraServer = ({
    now = () => new Date(),
    sleep = (ms) =>
        new Promise((resolve) => {
            setTimeout(resolve, ms);
        }),
    random = Math.random,
}: HydraServerOptions = {}) => {
    const callCounts = new Map<string, number>();
    const datasets = new Map<string, HydraDataset>();

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

    const fetch = async ({
        sourceKey,
        settings,
        token,
        request,
    }: HydraCall): Promise<LiveHttpResponse> => {
        const callNumber = (callCounts.get(sourceKey) ?? 0) + 1;
        callCounts.set(sourceKey, callNumber);
        if (settings.latencyMs > 0) await sleep(settings.latencyMs);

        if (settings.failAuth || !token) {
            return json(401, { message: 'The sign-in token was rejected' });
        }
        if (
            settings.retryAfterEvery > 0 &&
            callNumber % settings.retryAfterEvery === 0
        ) {
            return json(
                429,
                { message: 'Too many requests' },
                { 'retry-after': String(settings.retryAfterSeconds) },
            );
        }
        if (settings.errorRate > 0 && random() < settings.errorRate) {
            return json(500, { message: 'Injected server error' });
        }

        const dataset = getDataset(token, settings.rowCount);
        if (request.method === 'GET' && request.path === HYDRA_ACCOUNT_PATH) {
            return json(200, {
                account: getHydraAccountId(token),
                events: dataset.events.length,
                users: dataset.users.length,
            });
        }
        if (request.method === 'POST' && request.path === HYDRA_REPORT_PATH) {
            const parsed = hydraReportSchema.safeParse(request.body);
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
            );
            return json(200, {
                rows: rows.slice(0, limit),
                totalRows: rows.length,
            });
        }
        return json(404, {
            message: `No ${request.method} ${request.path} on Hydra`,
        });
    };

    return {
        fetch,
        /** Forgets call counts, so the next call is the first again. */
        reset: () => callCounts.clear(),
    };
};

export type HydraServer = ReturnType<typeof createHydraServer>;

/** The server every Hydra source on this backend calls. */
export const hydraServer = createHydraServer();
