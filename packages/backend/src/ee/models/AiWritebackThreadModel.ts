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

export class AiWritebackThreadModel {
    private database: Knex;

    constructor(dependencies: Dependencies) {
        this.database = dependencies.database;
    }

    /**
     * Resolve the resume row for a `(thread, repo)` pair — the unit a sandbox +
     * PR is keyed on since the re-key. `targetRepo` is "owner/repo". Legacy rows
     * (pre-backfill) carry a null `target_repo`; pass null to match those so the
     * dbt single-row path keeps resuming after upgrade.
     */
    async findByAiThreadUuidAndRepo(
        aiThreadUuid: string,
        targetRepo: string | null,
    ): Promise<AiWritebackThreadWithPrUrl | null> {
        const query = this.database(AiWritebackThreadTableName)
            .leftJoin(
                PullRequestsTableName,
                `${PullRequestsTableName}.pull_request_uuid`,
                `${AiWritebackThreadTableName}.pull_request_uuid`,
            )
            .where(
                `${AiWritebackThreadTableName}.ai_thread_uuid`,
                aiThreadUuid,
            );
        if (targetRepo === null) {
            void query.whereNull(`${AiWritebackThreadTableName}.target_repo`);
        } else {
            void query.where(
                `${AiWritebackThreadTableName}.target_repo`,
                targetRepo,
            );
        }
        const row = await query
            .select<AiWritebackThreadWithPrUrl>(
                `${AiWritebackThreadTableName}.*`,
                `${PullRequestsTableName}.pr_url`,
            )
            .first();
        return row ?? null;
    }

    async create(data: {
        aiThreadUuid: string;
        sandboxId: string;
        pullRequestUuid: string | null;
        targetRepo: string | null;
        provider: string | null;
        branch: string | null;
    }): Promise<DbAiWritebackThread> {
        const [row] = await this.database<AiWritebackThreadTable>(
            AiWritebackThreadTableName,
        )
            .insert({
                ai_thread_uuid: data.aiThreadUuid,
                sandbox_id: data.sandboxId,
                pull_request_uuid: data.pullRequestUuid,
                target_repo: data.targetRepo,
                provider: data.provider,
                branch: data.branch,
            })
            .returning('*');
        return row;
    }

    /** Link a (now-opened) PR onto an existing row + clear its pending branch. */
    async setPullRequest(
        aiWritebackThreadUuid: string,
        pullRequestUuid: string,
    ): Promise<void> {
        await this.database<AiWritebackThreadTable>(AiWritebackThreadTableName)
            .where('ai_writeback_thread_uuid', aiWritebackThreadUuid)
            .update({ pull_request_uuid: pullRequestUuid, branch: null });
    }

    async deleteByAiThreadUuid(aiThreadUuid: string): Promise<void> {
        await this.database<AiWritebackThreadTable>(AiWritebackThreadTableName)
            .where('ai_thread_uuid', aiThreadUuid)
            .delete();
    }

    async deleteByUuid(aiWritebackThreadUuid: string): Promise<void> {
        await this.database<AiWritebackThreadTable>(AiWritebackThreadTableName)
            .where('ai_writeback_thread_uuid', aiWritebackThreadUuid)
            .delete();
    }
}
