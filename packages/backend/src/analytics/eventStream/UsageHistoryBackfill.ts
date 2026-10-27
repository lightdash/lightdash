import { S3BaseClient } from '../../clients/Aws/S3BaseClient';
import type { S3Config } from '../../config/parseConfig';
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
    private readonly storage: Omit<S3Config, 'expirationTime'>;

    constructor(storage: Omit<S3Config, 'expirationTime'>) {
        super(storage);
        this.storage = storage;
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

    async run(
        org: string,
        history: Pick<
            UsageHistoryModel,
            'getQueryJsonLines' | 'getAiUsageJsonLines' | 'getActivityJsonLines'
        >,
    ): Promise<void> {
        const Key = usageHistoryCompletionKey(org);
        const models = [
            { getJsonLines: history.getQueryJsonLines.bind(history) },
            {
                getJsonLines: history.getAiUsageJsonLines.bind(history),
            },
            {
                getJsonLines: history.getActivityJsonLines.bind(history),
            },
        ];
        try {
            for (const [index, source] of usageHistorySources.entries()) {
                // eslint-disable-next-line no-await-in-loop
                await new UsageQueryHistoryBackfill(
                    this.storage,
                    models[index],
                    source,
                ).run(org);
            }
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
        } finally {
            this.s3?.destroy();
        }
    }
}
