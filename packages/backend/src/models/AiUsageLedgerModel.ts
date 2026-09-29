import { Knex } from 'knex';
import type { AiUsageEvent } from '../analytics/aiUsage';
import {
    AiUsageLedgerTableName,
    type DbAiUsageLedgerInsert,
} from '../database/entities/aiUsageLedger';

type Dependencies = {
    database: Knex;
};

export class AiUsageLedgerModel {
    private readonly database: Knex;

    constructor({ database }: Dependencies) {
        this.database = database;
    }

    /**
     * Calls with no organisation cannot be attributed to anyone's usage and
     * are dropped here, matching the usage stream.
     */
    async recordEvent(event: AiUsageEvent): Promise<void> {
        const { properties } = event;
        if (properties.organizationId === null) return;
        const row: DbAiUsageLedgerInsert = {
            event_id: properties.eventId,
            organization_uuid: properties.organizationId,
            project_uuid: properties.projectId,
            user_uuid: event.userId ?? null,
            agent_uuid: properties.aiAgentId,
            thread_uuid: properties.threadId,
            prompt_uuid: properties.promptId,
            app_uuid: properties.dataAppId,
            feature: properties.feature,
            function_id: properties.functionId,
            model: properties.model,
            provider: properties.provider,
            key_management: properties.keyManagement,
            usage_channel: properties.channel,
            outcome: properties.outcome,
            input_tokens: properties.inputTokens,
            output_tokens: properties.outputTokens,
            cache_read_tokens: properties.cacheReadTokens,
            cache_write_tokens: properties.cacheWriteTokens,
            reasoning_tokens: properties.reasoningTokens,
            total_tokens: properties.totalTokens,
        };
        await this.database(AiUsageLedgerTableName).insert(row);
    }

    async deleteOlderThan(days: number): Promise<number> {
        if (!Number.isInteger(days) || days <= 0) {
            throw new Error(`Invalid retention days: ${days}`);
        }
        return this.database(AiUsageLedgerTableName)
            .where(
                'created_at',
                '<',
                this.database.raw('now() - make_interval(days => ?)', [days]),
            )
            .delete();
    }
}
