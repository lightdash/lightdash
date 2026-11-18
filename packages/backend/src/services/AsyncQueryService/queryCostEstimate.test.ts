import {
    QueryCostEstimateExceededError,
    WarehouseQueryError,
    WarehouseTypes,
    type WarehouseClient,
} from '@lightdash/common';
import type Logger from '../../logging/logger';
import type PrometheusMetrics from '../../prometheus/PrometheusMetrics';
import {
    assertAgentQueryWithinEstimateLimit,
    QueryEstimateCache,
} from './queryCostEstimate';

const SQL = 'select secret_column from customer_table';

const makeClient = (
    credentials: Record<string, unknown>,
    totalBytesProcessed = 0,
) => {
    const estimateQuery = vi.fn(async () => ({ totalBytesProcessed }));
    return {
        client: {
            credentials: { type: WarehouseTypes.BIGQUERY, ...credentials },
            estimateQuery,
        } as unknown as WarehouseClient,
        estimateQuery,
    };
};

const makeTelemetry = () => {
    const prometheusMetrics = {
        trackQueryCostEstimate: vi.fn(),
        observeQueryCostEstimateDryRun: vi.fn(),
    };
    const logger = { info: vi.fn(), warn: vi.fn() };
    const cache = new QueryEstimateCache(
        prometheusMetrics as unknown as PrometheusMetrics,
        logger as unknown as typeof Logger,
    );
    return { cache, prometheusMetrics, logger };
};

const args = { sql: SQL, tags: {} };
const uuids = { projectUuid: 'project-uuid', organizationUuid: 'org-uuid' };
const explorer = { source: 'explorer' as const, ...uuids };

const assertAgent = (
    cache: QueryEstimateCache,
    client: WarehouseClient,
    onRefused = vi.fn(),
) =>
    assertAgentQueryWithinEstimateLimit(cache, client, args, {
        ...uuids,
        onRefused,
    });

describe('assertAgentQueryWithinEstimateLimit', () => {
    it('does not dry-run or record anything when no agent limit is configured', async () => {
        const { cache, prometheusMetrics, logger } = makeTelemetry();
        const { client, estimateQuery } = makeClient({}, 10 ** 12);
        await expect(assertAgent(cache, client)).resolves.toBeUndefined();
        expect(estimateQuery).not.toHaveBeenCalled();
        expect(prometheusMetrics.trackQueryCostEstimate).not.toHaveBeenCalled();
        expect(logger.info).not.toHaveBeenCalled();
    });

    it('allows queries at or below the limit and records an ok outcome', async () => {
        const { cache, prometheusMetrics, logger } = makeTelemetry();
        const { client } = makeClient(
            { agentMaximumEstimatedBytes: 1000 },
            1000,
        );
        const onRefused = vi.fn();
        await expect(
            assertAgent(cache, client, onRefused),
        ).resolves.toBeUndefined();
        expect(onRefused).not.toHaveBeenCalled();
        expect(prometheusMetrics.trackQueryCostEstimate).toHaveBeenCalledWith({
            source: 'agent_limit',
            outcome: 'ok',
            cache: 'miss',
        });
        expect(logger.info).toHaveBeenCalledWith(
            'Query cost estimate',
            expect.objectContaining({
                source: 'agent_limit',
                outcome: 'ok',
                estimatedBytes: 1000,
                limitBytes: 1000,
                projectUuid: 'project-uuid',
                organizationUuid: 'org-uuid',
                warehouseType: WarehouseTypes.BIGQUERY,
            }),
        );
    });

    it('refuses queries above the limit, reports the refusal and records exceeded', async () => {
        const { cache, prometheusMetrics } = makeTelemetry();
        const { client } = makeClient(
            { agentMaximumEstimatedBytes: 10_000_000_000 },
            120_000_000_000,
        );
        const onRefused = vi.fn();
        const error = await assertAgent(cache, client, onRefused).catch(
            (e: unknown) => e,
        );
        expect(error).toBeInstanceOf(QueryCostEstimateExceededError);
        expect((error as QueryCostEstimateExceededError).message).toContain(
            '120 GB',
        );
        expect((error as QueryCostEstimateExceededError).data).toEqual({
            estimatedBytes: 120_000_000_000,
            limitBytes: 10_000_000_000,
        });
        expect(onRefused).toHaveBeenCalledWith({
            estimatedBytes: 120_000_000_000,
            limitBytes: 10_000_000_000,
            cacheHit: false,
        });
        expect(prometheusMetrics.trackQueryCostEstimate).toHaveBeenCalledWith({
            source: 'agent_limit',
            outcome: 'exceeded',
            cache: 'miss',
        });
    });

    it('reports a cached refusal without another dry run', async () => {
        const { cache, prometheusMetrics } = makeTelemetry();
        const { client, estimateQuery } = makeClient(
            { agentMaximumEstimatedBytes: 1 },
            2,
        );
        const onRefused = vi.fn();
        await assertAgent(cache, client, onRefused).catch(() => undefined);
        await assertAgent(cache, client, onRefused).catch(() => undefined);
        expect(estimateQuery).toHaveBeenCalledTimes(1);
        expect(onRefused).toHaveBeenLastCalledWith(
            expect.objectContaining({ cacheHit: true }),
        );
        expect(
            prometheusMetrics.trackQueryCostEstimate,
        ).toHaveBeenLastCalledWith({
            source: 'agent_limit',
            outcome: 'exceeded',
            cache: 'hit',
        });
    });

    it('records unavailable for warehouses without a dry run', async () => {
        const { cache, prometheusMetrics } = makeTelemetry();
        const client = {
            credentials: {
                type: WarehouseTypes.BIGQUERY,
                agentMaximumEstimatedBytes: 1,
            },
        } as unknown as WarehouseClient;
        await expect(assertAgent(cache, client)).resolves.toBeUndefined();
        expect(prometheusMetrics.trackQueryCostEstimate).toHaveBeenCalledWith({
            source: 'agent_limit',
            outcome: 'unavailable',
            cache: 'none',
        });
    });

    it('logs dry-run failures without SQL or error text and rethrows them', async () => {
        const { cache, prometheusMetrics, logger } = makeTelemetry();
        const { client, estimateQuery } = makeClient({
            agentMaximumEstimatedBytes: 1000,
        });
        const failure = new WarehouseQueryError(
            'Unrecognized name: secret_column in customer_table',
        );
        estimateQuery.mockRejectedValueOnce(failure);
        await expect(assertAgent(cache, client)).rejects.toBe(failure);
        expect(prometheusMetrics.trackQueryCostEstimate).toHaveBeenCalledWith({
            source: 'agent_limit',
            outcome: 'error',
            cache: 'miss',
        });
        expect(
            prometheusMetrics.observeQueryCostEstimateDryRun,
        ).toHaveBeenCalledWith(
            expect.objectContaining({
                source: 'agent_limit',
                outcome: 'error',
            }),
        );
        expect(logger.warn).toHaveBeenCalledWith(
            'Query cost estimate failed',
            expect.objectContaining({
                outcome: 'error',
                errorName: 'WarehouseQueryError',
                errorStatusCode: failure.statusCode,
                projectUuid: 'project-uuid',
            }),
        );
        const logged = JSON.stringify(logger.warn.mock.calls);
        expect(logged).not.toContain('secret_column');
        expect(logged).not.toContain('customer_table');
    });
});

describe('QueryEstimateCache', () => {
    it('times real dry runs and reports cache hits without a duration', async () => {
        const { cache, prometheusMetrics } = makeTelemetry();
        const { client, estimateQuery } = makeClient({ project: 'a' }, 5);
        const first = await cache.estimate(client, args, explorer);
        const second = await cache.estimate(client, args, explorer);
        expect(estimateQuery).toHaveBeenCalledTimes(1);
        expect(first).toEqual({
            kind: 'estimated',
            estimate: { totalBytesProcessed: 5 },
            cacheHit: false,
            dryRunDurationMs: expect.any(Number),
        });
        expect(second).toEqual({
            kind: 'estimated',
            estimate: { totalBytesProcessed: 5 },
            cacheHit: true,
            dryRunDurationMs: null,
        });
        expect(
            prometheusMetrics.observeQueryCostEstimateDryRun,
        ).toHaveBeenCalledTimes(1);
        expect(
            prometheusMetrics.observeQueryCostEstimateDryRun,
        ).toHaveBeenCalledWith({
            source: 'explorer',
            outcome: 'ok',
            durationMs: expect.any(Number),
        });
    });

    it('does not share estimates across credentials', async () => {
        const { cache } = makeTelemetry();
        const first = makeClient({ project: 'a' }, 5);
        const second = makeClient({ project: 'b' }, 7);
        await cache.estimate(first.client, args, explorer);
        await expect(
            cache.estimate(second.client, args, explorer),
        ).resolves.toEqual(
            expect.objectContaining({
                estimate: { totalBytesProcessed: 7 },
                cacheHit: false,
            }),
        );
        expect(second.estimateQuery).toHaveBeenCalledTimes(1);
    });

    it('returns failures without caching them', async () => {
        const { cache } = makeTelemetry();
        const { client, estimateQuery } = makeClient({ project: 'a' }, 5);
        const failure = new Error('boom');
        estimateQuery.mockRejectedValueOnce(failure);
        await expect(cache.estimate(client, args, explorer)).resolves.toEqual({
            kind: 'failed',
            error: failure,
            dryRunDurationMs: expect.any(Number),
        });
        await expect(cache.estimate(client, args, explorer)).resolves.toEqual(
            expect.objectContaining({ kind: 'estimated', cacheHit: false }),
        );
        expect(estimateQuery).toHaveBeenCalledTimes(2);
    });

    it('reports unavailable when the warehouse has no dry run', async () => {
        const { cache } = makeTelemetry();
        const client = {
            credentials: { type: WarehouseTypes.POSTGRES },
        } as unknown as WarehouseClient;
        await expect(cache.estimate(client, args, explorer)).resolves.toEqual({
            kind: 'unavailable',
        });
    });
});
