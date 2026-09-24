import { assertUnreachable } from '@lightdash/common';
import { setTimeout as sleep } from 'node:timers/promises';
import { z } from 'zod';
import { projectUuid } from './agents';
import type { LightdashApi } from './api';

const queryResultsSchema = z.discriminatedUnion('status', [
    z.object({
        status: z.literal('ready'),
        queryUuid: z.string(),
        rows: z.array(z.record(z.string(), z.unknown())),
    }),
    z.object({
        status: z.enum(['pending', 'queued', 'executing']),
        queryUuid: z.string(),
    }),
    z.object({ status: z.literal('cancelled'), queryUuid: z.string() }),
    z.object({
        status: z.enum(['error', 'expired']),
        queryUuid: z.string(),
        error: z.string().nullable(),
    }),
]);

export type QueryRun =
    | { kind: 'rows'; queryUuid: string; rowCount: number }
    | { kind: 'error'; queryUuid: string; message: string };

export type MetricQueryInput = {
    exploreName: string;
    dimensions: string[];
    metrics: string[];
    sorts: { fieldId: string; descending: boolean }[];
    tableCalculations: {
        name: string;
        displayName: string;
        sql: string;
        type?: string;
    }[];
};

/**
 * Polls an async query until it is terminal. A warehouse query takes as long
 * as it takes (plan §8.5).
 */
export const pollQuery = async (
    api: LightdashApi,
    queryUuid: string,
): Promise<QueryRun> => {
    for (;;) {
        const results = await api.get(
            `/api/v2/projects/${projectUuid}/query/${queryUuid}`,
            queryResultsSchema,
        );
        switch (results.status) {
            case 'ready':
                return {
                    kind: 'rows',
                    queryUuid,
                    rowCount: results.rows.length,
                };
            case 'error':
            case 'expired':
                return {
                    kind: 'error',
                    queryUuid,
                    message: results.error ?? results.status,
                };
            case 'cancelled':
                return { kind: 'error', queryUuid, message: 'cancelled' };
            case 'pending':
            case 'queued':
            case 'executing':
                await sleep(500);
                break;
            default:
                return assertUnreachable(results, 'Unknown query status');
        }
    }
};

/** Runs a metric query through the async query API. */
export const runMetricQuery = async (
    api: LightdashApi,
    query: MetricQueryInput,
): Promise<QueryRun> => {
    const { queryUuid } = await api.post(
        `/api/v2/projects/${projectUuid}/query/metric-query`,
        {
            context: 'api',
            query: {
                ...query,
                filters: {},
                limit: 500,
                additionalMetrics: [],
                customDimensions: [],
            },
        },
        z.object({ queryUuid: z.string() }),
    );
    return pollQuery(api, queryUuid);
};
