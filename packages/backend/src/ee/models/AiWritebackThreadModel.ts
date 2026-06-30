import { Knex } from 'knex';
import { PullRequestsTableName } from '../../database/entities/pullRequests';
import {
    AiWritebackThreadTable,
    AiWritebackThreadTableName,
    DbAiWritebackThread,
} from '../database/entities/ai';

type Dependencies = {
    database: Knex;
};

/**
 * A writeback thread row enriched with the PR URL resolved from the linked
 * `pull_requests` row. `pr_url` is null only when the link was cleared (the
 * FK is ON DELETE SET NULL).
 */
export type AiWritebackThreadWithPrUrl = DbAiWritebackThread & {
    pr_url: string | null;
};

/**
 * A writeback thread that points at a registry sandbox (`sandbox_uuid` is
 * non-null). A null `sandbox_uuid` only occurs for a row an old pod inserts
 * mid-rollout, which is not resumable; the service narrows to this type before
 * driving a resume.
 */
export type ResumableWritebackThread = AiWritebackThreadWithPrUrl & {
    sandbox_uuid: string;
};

export class AiWritebackThreadModel {
    private database: Knex;

    constructor(dependencies: Dependencies) {
        this.database = dependencies.database;
    }

    async findByAiThreadUuid(
        aiThreadUuid: string,
    ): Promise<AiWritebackThreadWithPrUrl | null> {
        const row = await this.database(AiWritebackThreadTableName)
            .leftJoin(
                PullRequestsTableName,
                `${PullRequestsTableName}.pull_request_uuid`,
                `${AiWritebackThreadTableName}.pull_request_uuid`,
            )
            .where(`${AiWritebackThreadTableName}.ai_thread_uuid`, aiThreadUuid)
            .select<AiWritebackThreadWithPrUrl>(
                `${AiWritebackThreadTableName}.*`,
                `${PullRequestsTableName}.pr_url`,
            )
            .first();
        return row ?? null;
    }

    async create(data: {
        aiThreadUuid: string;
        sandboxUuid: string;
        pullRequestUuid: string;
    }): Promise<DbAiWritebackThread> {
        const [row] = await this.database<AiWritebackThreadTable>(
            AiWritebackThreadTableName,
        )
            .insert({
                ai_thread_uuid: data.aiThreadUuid,
                sandbox_uuid: data.sandboxUuid,
                pull_request_uuid: data.pullRequestUuid,
            })
            .returning('*');
        return row;
    }

    async deleteByAiThreadUuid(aiThreadUuid: string): Promise<void> {
        await this.database<AiWritebackThreadTable>(AiWritebackThreadTableName)
            .where('ai_thread_uuid', aiThreadUuid)
            .delete();
    }
}
