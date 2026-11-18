import {
    getAgentEstimateExceededMessage,
    getQueryCostEstimateSettings,
    QueryCostEstimateExceededError,
    type WarehouseClient,
    type WarehouseExecuteAsyncQueryArgs,
    type WarehouseQueryEstimate,
} from '@lightdash/common';
import { SpanStatusCode } from '@opentelemetry/api';
import NodeCache from 'node-cache';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import Logger from '../../logging/logger';
import type PrometheusMetrics from '../../prometheus/PrometheusMetrics';
import { traceSpan } from '../../tracing/tracing';
import {
    getQueryCostEstimateLogMeta,
    type QueryCostEstimateRecord,
    type QueryCostEstimateTelemetryContext,
} from './queryCostEstimateTelemetry';

const ESTIMATE_TTL_SECONDS = 5 * 60;
const MAX_CACHED_ESTIMATES = 10_000;

export type QueryEstimateResult =
    | { kind: 'unavailable' }
    | {
          kind: 'estimated';
          estimate: WarehouseQueryEstimate;
          cacheHit: boolean;
          dryRunDurationMs: number | null;
      }
    | { kind: 'failed'; error: unknown; dryRunDurationMs: number | null };

type DryRunAttempt =
    | { ok: true; estimate: WarehouseQueryEstimate }
    | { ok: false; error: unknown };

/**
 * Dry runs are free and fast, but agents and the explorer repeat the same SQL.
 * Keyed by the full credentials so an estimate is never shared across
 * identities that may see different tables.
 */
export class QueryEstimateCache {
    private readonly cache = new NodeCache({
        stdTTL: ESTIMATE_TTL_SECONDS,
        maxKeys: MAX_CACHED_ESTIMATES,
        useClones: false,
    });

    constructor(
        private readonly prometheusMetrics: PrometheusMetrics | undefined,
        private readonly logger: typeof Logger = Logger,
    ) {}

    static getKey(
        warehouseClient: WarehouseClient,
        args: Pick<WarehouseExecuteAsyncQueryArgs, 'sql' | 'values'>,
    ): string {
        return createHash('sha256')
            .update(
                JSON.stringify([
                    warehouseClient.credentials,
                    args.sql,
                    args.values ?? null,
                ]),
            )
            .digest('hex');
    }

    async estimate(
        warehouseClient: WarehouseClient,
        args: WarehouseExecuteAsyncQueryArgs,
        telemetry: QueryCostEstimateTelemetryContext,
    ): Promise<QueryEstimateResult> {
        const { estimateQuery } = warehouseClient;
        if (!estimateQuery) return { kind: 'unavailable' };
        const key = QueryEstimateCache.getKey(warehouseClient, args);
        const cached = this.cache.get<WarehouseQueryEstimate>(key);
        if (cached) {
            return {
                kind: 'estimated',
                estimate: cached,
                cacheHit: true,
                dryRunDurationMs: null,
            };
        }
        const start = performance.now();
        // Errors are caught inside the span so warehouse error text never lands on it
        const attempt = await traceSpan(
            {
                op: 'warehouse.estimate_query',
                name: 'query_cost_estimate.dry_run',
                attributes: {
                    'lightdash.projectUuid': telemetry.projectUuid,
                    'lightdash.organizationUuid': telemetry.organizationUuid,
                    'lightdash.queryCostEstimateSource': telemetry.source,
                    'lightdash.warehouseType': warehouseClient.credentials.type,
                },
            },
            async (span): Promise<DryRunAttempt> => {
                try {
                    return {
                        ok: true,
                        estimate: await estimateQuery.call(
                            warehouseClient,
                            args,
                        ),
                    };
                } catch (error) {
                    span.setStatus({ code: SpanStatusCode.ERROR });
                    span.setAttribute(
                        'lightdash.errorName',
                        error instanceof Error ? error.name : typeof error,
                    );
                    return { ok: false, error };
                }
            },
        );
        const dryRunDurationMs = performance.now() - start;
        this.prometheusMetrics?.observeQueryCostEstimateDryRun({
            source: telemetry.source,
            outcome: attempt.ok ? 'ok' : 'error',
            durationMs: dryRunDurationMs,
        });
        if (!attempt.ok) {
            return { kind: 'failed', error: attempt.error, dryRunDurationMs };
        }
        if (this.cache.getStats().keys < MAX_CACHED_ESTIMATES) {
            this.cache.set(key, attempt.estimate);
        }
        return {
            kind: 'estimated',
            estimate: attempt.estimate,
            cacheHit: false,
            dryRunDurationMs,
        };
    }

    record(record: QueryCostEstimateRecord): void {
        this.prometheusMetrics?.trackQueryCostEstimate({
            source: record.source,
            outcome: record.outcome,
            cache: record.cache,
        });
        const meta = getQueryCostEstimateLogMeta(record);
        if (record.outcome === 'error') {
            this.logger.warn('Query cost estimate failed', meta);
        } else {
            this.logger.info('Query cost estimate', meta);
        }
    }
}

export type AgentEstimateRefusal = {
    estimatedBytes: number;
    limitBytes: number;
    cacheHit: boolean;
};

/**
 * Refuses an agent query whose dry-run estimate is above the connection's
 * agent limit. maximumBytesBilled stays the backstop: dry runs report 0 bytes
 * for row-level security and can underreport external tables.
 */
export const assertAgentQueryWithinEstimateLimit = async (
    cache: QueryEstimateCache,
    warehouseClient: WarehouseClient,
    args: WarehouseExecuteAsyncQueryArgs,
    {
        projectUuid,
        organizationUuid,
        onRefused,
    }: {
        projectUuid: string;
        organizationUuid: string;
        onRefused: (refusal: AgentEstimateRefusal) => void;
    },
): Promise<void> => {
    const limitBytes =
        getQueryCostEstimateSettings(warehouseClient.credentials)
            ?.agentMaximumEstimatedBytes ?? null;
    if (limitBytes === null) return;
    const telemetry: QueryCostEstimateTelemetryContext = {
        source: 'agent_limit',
        projectUuid,
        organizationUuid,
    };
    const result = await cache.estimate(warehouseClient, args, telemetry);
    const base = {
        ...telemetry,
        warehouseType: warehouseClient.credentials.type,
        thresholdBytes: limitBytes,
        requiresConfirmation: null,
    };
    if (result.kind === 'unavailable') {
        cache.record({
            ...base,
            outcome: 'unavailable',
            cache: 'none',
            dryRunDurationMs: null,
            estimatedBytes: null,
            error: null,
        });
        return;
    }
    if (result.kind === 'failed') {
        cache.record({
            ...base,
            outcome: 'error',
            cache: 'miss',
            dryRunDurationMs: result.dryRunDurationMs,
            estimatedBytes: null,
            error: result.error,
        });
        throw result.error;
    }
    const estimatedBytes = result.estimate.totalBytesProcessed;
    const exceeded = estimatedBytes > limitBytes;
    cache.record({
        ...base,
        outcome: exceeded ? 'exceeded' : 'ok',
        cache: result.cacheHit ? 'hit' : 'miss',
        dryRunDurationMs: result.dryRunDurationMs,
        estimatedBytes,
        error: null,
    });
    if (!exceeded) return;
    onRefused({ estimatedBytes, limitBytes, cacheHit: result.cacheHit });
    throw new QueryCostEstimateExceededError(
        getAgentEstimateExceededMessage({ estimatedBytes, limitBytes }),
        { estimatedBytes, limitBytes },
    );
};
