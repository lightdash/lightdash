import { sleep } from '@lightdash/common';
import { type Knex } from 'knex';
import {
    AgentActionLogTableName,
    type InsertAgentActionLog,
} from '../database/entities/agentActionLog';

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
        batchSize: number,
        delayMs: number,
        maxBatches: number | undefined,
        totalDeleted = 0,
        batchCount = 0,
    ): Promise<{ totalDeleted: number; batchCount: number }> {
        const { database } = this.dependencies;
        const deleted = await database(AgentActionLogTableName)
            .whereIn(
                'agent_action_log_uuid',
                database(AgentActionLogTableName)
                    .select('agent_action_log_uuid')
                    .where('occurred_at', '<', cutoffDate)
                    .orderBy('occurred_at', 'asc')
                    .limit(batchSize),
            )
            .delete();
        if (deleted === 0) return { totalDeleted, batchCount };
        const next = {
            totalDeleted: totalDeleted + deleted,
            batchCount: batchCount + 1,
        };
        if (
            deleted < batchSize ||
            (maxBatches !== undefined && next.batchCount >= maxBatches)
        )
            return next;
        await sleep(delayMs);
        return this.cleanupBatch(
            cutoffDate,
            batchSize,
            delayMs,
            maxBatches,
            next.totalDeleted,
            next.batchCount,
        );
    }
}
