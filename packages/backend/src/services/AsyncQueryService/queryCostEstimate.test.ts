import {
    QueryCostEstimateExceededError,
    WarehouseTypes,
    type WarehouseClient,
} from '@lightdash/common';
import {
    assertAgentQueryWithinEstimateLimit,
    QueryEstimateCache,
} from './queryCostEstimate';

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

const args = { sql: 'select * from big_table', tags: {} };

describe('assertAgentQueryWithinEstimateLimit', () => {
    it('does not dry-run when no agent limit is configured', async () => {
        const { client, estimateQuery } = makeClient({}, 10 ** 12);
        await expect(
            assertAgentQueryWithinEstimateLimit(
                new QueryEstimateCache(),
                client,
                args,
            ),
        ).resolves.toBeUndefined();
        expect(estimateQuery).not.toHaveBeenCalled();
    });

    it('allows queries at or below the limit', async () => {
        const { client } = makeClient(
            { agentMaximumEstimatedBytes: 1000 },
            1000,
        );
        await expect(
            assertAgentQueryWithinEstimateLimit(
                new QueryEstimateCache(),
                client,
                args,
            ),
        ).resolves.toBeUndefined();
    });

    it('refuses queries above the limit and returns the estimate', async () => {
        const { client } = makeClient(
            { agentMaximumEstimatedBytes: 10_000_000_000 },
            120_000_000_000,
        );
        const error = await assertAgentQueryWithinEstimateLimit(
            new QueryEstimateCache(),
            client,
            args,
        ).catch((e: unknown) => e);
        expect(error).toBeInstanceOf(QueryCostEstimateExceededError);
        expect((error as QueryCostEstimateExceededError).message).toContain(
            '120 GB',
        );
        expect((error as QueryCostEstimateExceededError).data).toEqual({
            estimatedBytes: 120_000_000_000,
            limitBytes: 10_000_000_000,
        });
    });

    it('ignores warehouses without a dry run', async () => {
        const client = {
            credentials: {
                type: WarehouseTypes.BIGQUERY,
                agentMaximumEstimatedBytes: 1,
            },
        } as unknown as WarehouseClient;
        await expect(
            assertAgentQueryWithinEstimateLimit(
                new QueryEstimateCache(),
                client,
                args,
            ),
        ).resolves.toBeUndefined();
    });

    it('propagates dry-run failures instead of running unchecked', async () => {
        const { client, estimateQuery } = makeClient({
            agentMaximumEstimatedBytes: 1000,
        });
        estimateQuery.mockRejectedValueOnce(new Error('Syntax error'));
        await expect(
            assertAgentQueryWithinEstimateLimit(
                new QueryEstimateCache(),
                client,
                args,
            ),
        ).rejects.toThrow('Syntax error');
    });
});

describe('QueryEstimateCache', () => {
    it('reuses an estimate for the same SQL and credentials', async () => {
        const cache = new QueryEstimateCache();
        const { client, estimateQuery } = makeClient({ project: 'a' }, 5);
        await cache.estimate(client, args);
        await cache.estimate(client, args);
        expect(estimateQuery).toHaveBeenCalledTimes(1);
    });

    it('does not share estimates across credentials', async () => {
        const cache = new QueryEstimateCache();
        const first = makeClient({ project: 'a' }, 5);
        const second = makeClient({ project: 'b' }, 7);
        await cache.estimate(first.client, args);
        await expect(cache.estimate(second.client, args)).resolves.toEqual({
            totalBytesProcessed: 7,
        });
        expect(second.estimateQuery).toHaveBeenCalledTimes(1);
    });
});
