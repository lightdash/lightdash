import type { AnalyticsProcessingStats } from '@lightdash/common';
import Logger from '../../logging/logger';
import type { UsageProcessingModel } from '../../models/UsageProcessingModel';
import type { DimensionRefreshSummary } from './UsageDimensionsRefresher';
import type { UserActivitySummary } from './UsageUserActivityBuilder';

type OrganizationProgress = {
    stats: AnalyticsProcessingStats;
    compactionFinished: boolean;
    dimensionsFinished: boolean;
    usersFinished: boolean;
    hasSuccessfulWork: boolean;
};

export class UsageProcessingRun {
    private readonly organizations = new Map<string, OrganizationProgress>();

    private recorded = false;

    constructor(
        private readonly model: Pick<
            UsageProcessingModel,
            'start' | 'finish'
        > | null,
        private readonly runUuid: string,
    ) {}

    async start(organizationUuids: string[]): Promise<void> {
        for (const organizationUuid of organizationUuids) {
            this.organizations.set(organizationUuid, {
                stats: {
                    partitionsDiscovered: 0,
                    partitionsCompacted: 0,
                    partitionsFailed: 0,
                    rawObjectsDeleted: 0,
                    dimensionsFailed: 0,
                    userPartitionsFailed: 0,
                    userPartitionsDeferred: 0,
                    limitReached: false,
                },
                compactionFinished: false,
                dimensionsFinished: false,
                usersFinished: false,
                hasSuccessfulWork: false,
            });
        }
        if (!this.model || organizationUuids.length === 0) return;
        try {
            await this.model.start(organizationUuids, this.runUuid, new Date());
            this.recorded = true;
        } catch {
            Logger.warn('Unable to record analytics processing start');
        }
    }

    stats(organizationUuid: string): AnalyticsProcessingStats {
        const progress = this.organizations.get(organizationUuid);
        if (!progress)
            throw new Error('Unexpected usage processing organization');
        return progress.stats;
    }

    compactionFinished(): void {
        for (const progress of this.organizations.values()) {
            progress.compactionFinished = true;
            progress.hasSuccessfulWork ||=
                progress.stats.partitionsCompacted > 0 ||
                progress.stats.rawObjectsDeleted > 0;
        }
    }

    dimensionsFinished(
        organizationUuid: string,
        summary: DimensionRefreshSummary,
    ): void {
        const progress = this.organizations.get(organizationUuid)!;
        progress.dimensionsFinished = true;
        progress.stats.dimensionsFailed = summary.failed;
        progress.hasSuccessfulWork ||= summary.refreshed > 0;
    }

    usersFinished(
        organizationUuid: string,
        summary: UserActivitySummary,
        completed: boolean,
    ): void {
        const progress = this.organizations.get(organizationUuid)!;
        progress.usersFinished = completed;
        progress.stats.userPartitionsFailed = summary.failed;
        progress.stats.userPartitionsDeferred = summary.deferred;
        progress.stats.limitReached ||= summary.limitReached;
        progress.hasSuccessfulWork ||=
            summary.published + summary.unchanged > 0;
    }

    async finish(): Promise<void> {
        if (!this.recorded || !this.model) return;
        for (const [organizationUuid, progress] of this.organizations) {
            const { stats } = progress;
            const successful =
                progress.compactionFinished &&
                progress.dimensionsFinished &&
                progress.usersFinished &&
                stats.partitionsCompacted === stats.partitionsDiscovered &&
                stats.partitionsFailed === 0 &&
                stats.dimensionsFailed === 0 &&
                stats.userPartitionsFailed === 0 &&
                stats.userPartitionsDeferred === 0 &&
                !stats.limitReached;
            let status: 'success' | 'partial' | 'failed' = 'failed';
            if (successful) status = 'success';
            else if (progress.hasSuccessfulWork) status = 'partial';
            try {
                // eslint-disable-next-line no-await-in-loop
                await this.model.finish({
                    organizationUuid,
                    runUuid: this.runUuid,
                    status,
                    finishedAt: new Date(),
                    stats,
                });
            } catch {
                Logger.warn('Unable to record analytics processing result');
            }
        }
    }
}
