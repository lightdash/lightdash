import type { AnalyticsHistoryBackfillStatus } from '@lightdash/common';
import { S3BaseClient } from '../../clients/Aws/S3BaseClient';
import type { S3Config } from '../../config/parseConfig';
import type { UsageDimensionsModel } from '../../models/UsageDimensionsModel';
import type { UsageHistoryModel } from '../../models/UsageHistoryModel';
import { usageHistorySources } from './usageHistorySources';
import { UsageQueryHistoryBackfill } from './UsageQueryHistoryBackfill';

// A versioned success signal, not a claim that every future DB record is covered.
export const usageHistoryCompletionKey = (org: string) => {
    if (
        !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(
            org,
        )
    )
        throw new Error('Invalid organization');
    return `events/backfill/org_id=${org}/v1/complete.json`;
};

/** One queued operation, processing sources serially. Partial success is durable;
 * a retry reconciles each source without republishing duplicate rows. */
export class UsageHistoryBackfill extends S3BaseClient {
    constructor(
        private readonly storage: Omit<S3Config, 'expirationTime'>,
        private readonly history: Pick<
            UsageHistoryModel,
            'getQueryJsonLines' | 'getAiUsageJsonLines' | 'getActivityJsonLines'
        >,
    ) {
        super(storage);
    }

    async isComplete(org: string): Promise<boolean> {
        const Key = usageHistoryCompletionKey(org);
        try {
            await this.s3!.headObject(
                { Bucket: this.storage.bucket, Key },
                { abortSignal: AbortSignal.timeout(10_000) },
            );
            return true;
        } catch (error) {
            if (
                (error as { $metadata?: { httpStatusCode?: number } }).$metadata
                    ?.httpStatusCode === 404
            )
                return false;
            throw new Error('Unable to check analytics backfill status');
        } finally {
            this.s3?.destroy();
        }
    }

    private async process(
        org: string,
        dimensions?: UsageDimensionsModel,
    ): Promise<AnalyticsHistoryBackfillStatus> {
        const models = [
            { getJsonLines: this.history.getQueryJsonLines.bind(this.history) },
            {
                getJsonLines: this.history.getAiUsageJsonLines.bind(
                    this.history,
                ),
            },
            {
                getJsonLines: this.history.getActivityJsonLines.bind(
                    this.history,
                ),
            },
        ];
        const results: AnalyticsHistoryBackfillStatus[] = [];
        let refreshed = false;
        for (const [index, source] of usageHistorySources.entries()) {
            const importer = new UsageQueryHistoryBackfill(
                this.storage,
                models[index],
                source,
            );
            // eslint-disable-next-line no-await-in-loop
            const result = await (dimensions
                ? importer.run(org, refreshed ? undefined : dimensions)
                : importer.inspect(org));
            if (result.missingQueries > 0) refreshed = true;
            results.push(result);
        }
        return {
            ...results[0],
            missingRecords: results.reduce(
                (sum, result) => sum + result.missingQueries,
                0,
            ),
            existingRecords: results.reduce(
                (sum, result) => sum + result.existingQueries,
                0,
            ),
            pendingRecords: results.reduce(
                (sum, result) => sum + result.pendingQueries,
                0,
            ),
            from:
                results.flatMap(({ from }) => (from ? [from] : [])).sort()[0] ??
                null,
            to:
                results
                    .flatMap(({ to }) => (to ? [to] : []))
                    .sort()
                    .at(-1) ?? null,
            sources: results.map((result, index) => ({
                name: usageHistorySources[index].name,
                missing: result.missingQueries,
                existing: result.existingQueries,
                pending: result.pendingQueries,
            })),
        };
    }

    async inspect(org: string) {
        return this.process(org);
    }

    async run(org: string, dimensions: UsageDimensionsModel) {
        const Key = usageHistoryCompletionKey(org);
        try {
            const result = await this.process(org, dimensions);
            // Publish only after every source succeeds, including empty/no-op runs.
            await this.s3!.putObject(
                {
                    Bucket: this.storage.bucket,
                    Key,
                    Body: JSON.stringify({
                        completedAt: new Date().toISOString(),
                    }),
                    ContentType: 'application/json',
                },
                { abortSignal: AbortSignal.timeout(10_000) },
            );
            return result;
        } finally {
            this.s3?.destroy();
        }
    }
}
