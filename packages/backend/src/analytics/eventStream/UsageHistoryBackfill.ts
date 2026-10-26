import type { AnalyticsHistoryBackfillStatus } from '@lightdash/common';
import type { S3Config } from '../../config/parseConfig';
import type { UsageDimensionsModel } from '../../models/UsageDimensionsModel';
import type { UsageHistoryModel } from '../../models/UsageHistoryModel';
import { usageHistorySources } from './usageHistorySources';
import { UsageQueryHistoryBackfill } from './UsageQueryHistoryBackfill';

/** One queued operation, processing bounded sources serially. Partial success is
 * durable; a retry reconciles each source without republishing duplicate rows. */
export class UsageHistoryBackfill {
    constructor(
        private readonly storage: Omit<S3Config, 'expirationTime'>,
        private readonly history: Pick<
            UsageHistoryModel,
            'getQueryJsonLines' | 'getAiUsageJsonLines' | 'getActivityJsonLines'
        >,
    ) {}

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
        return this.process(org, dimensions);
    }
}
