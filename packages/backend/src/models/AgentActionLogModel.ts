import { sleep } from '@lightdash/common';
import { type Knex } from 'knex';
import {
    AgentActionLogTableName,
    type InsertAgentActionLog,
} from '../database/entities/agentActionLog';
import {
    pauseBetweenBatchesMs,
    type RetentionCleanupOptions,
    type RetentionCleanupResult,
} from './retentionCleanup';

export class AgentActionLogModel {
    constructor(private readonly dependencies: { database: Knex }) {}

    async insert(
        entry: InsertAgentActionLog,
        trx?: Knex.Transaction,
    ): Promise<void> {
        await (trx ?? this.dependencies.database)(
            AgentActionLogTableName,
        ).insert(entry);
    }

    async cleanupBatch(
        cutoffDate: Date,
        options: RetentionCleanupOptions,
    ): Promise<RetentionCleanupResult> {
        return this.deleteExpiredBatches(cutoffDate, options, {
            totalDeleted: 0,
            batchCount: 0,
        });
    }

    private async deleteExpiredBatches(
        cutoffDate: Date,
        options: RetentionCleanupOptions,
        progress: { totalDeleted: number; batchCount: number },
    ): Promise<RetentionCleanupResult> {
        const { database } = this.dependencies;
        const batchStartedAt = Date.now();
        const deleted = await database(AgentActionLogTableName)
            .whereIn(
                'agent_action_log_uuid',
                database(AgentActionLogTableName)
                    .select('agent_action_log_uuid')
                    .where('occurred_at', '<', cutoffDate)
                    .orderBy('occurred_at', 'asc')
                    .limit(options.batchSize),
            )
            .delete();
        if (deleted === 0) return { ...progress, completed: true };
        const next = {
            totalDeleted: progress.totalDeleted + deleted,
            batchCount: progress.batchCount + 1,
        };
        if (deleted < options.batchSize) return { ...next, completed: true };
        if (next.batchCount >= options.maxBatches) {
            return { ...next, completed: false };
        }
        await sleep(
            pauseBetweenBatchesMs(options, Date.now() - batchStartedAt),
        );
        return this.deleteExpiredBatches(cutoffDate, options, next);
    }
}
