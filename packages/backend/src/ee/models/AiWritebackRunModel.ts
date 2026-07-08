import {
    AI_WRITEBACK_RUN_TERMINAL_STATUSES,
    type AiWritebackRunStatus,
    type AiWritebackSource,
} from '@lightdash/common';
import { Knex } from 'knex';
import {
    AiWritebackRunTable,
    AiWritebackRunTableName,
    DbAiWritebackRun,
} from '../database/entities/ai';

type Dependencies = {
    database: Knex;
};

/**
 * Tracks a writeback job end-to-end (see {@link DbAiWritebackRun}) so a caller
 * whose connection died can poll for the outcome instead of the run only ever
 * reporting through the request that started it.
 */
export class AiWritebackRunModel {
    private database: Knex;

    constructor(dependencies: Dependencies) {
        this.database = dependencies.database;
    }

    async findByUuid(
        aiWritebackRunUuid: string,
    ): Promise<DbAiWritebackRun | undefined> {
        return this.database<AiWritebackRunTable>(AiWritebackRunTableName)
            .where('ai_writeback_run_uuid', aiWritebackRunUuid)
            .first();
    }

    /** Create the 'pending' row before the job is enqueued. */
    async create(data: {
        organizationUuid: string;
        projectUuid: string;
        aiThreadUuid: string | null;
        createdByUserUuid: string;
        source: AiWritebackSource;
    }): Promise<DbAiWritebackRun> {
        const [row] = await this.database<AiWritebackRunTable>(
            AiWritebackRunTableName,
        )
            .insert({
                organization_uuid: data.organizationUuid,
                project_uuid: data.projectUuid,
                ai_thread_uuid: data.aiThreadUuid,
                created_by_user_uuid: data.createdByUserUuid,
                source: data.source,
            })
            .returning('*');
        return row;
    }

    /**
     * Advance the run to a non-terminal status (a pipeline stage). Silently a
     * no-op if the run has already reached a terminal status — a stage update
     * racing a timeout/error from a previous attempt must not resurrect it.
     */
    async updateStageIfInProgress(
        aiWritebackRunUuid: string,
        status: AiWritebackRunStatus,
    ): Promise<void> {
        await this.database<AiWritebackRunTable>(AiWritebackRunTableName)
            .where('ai_writeback_run_uuid', aiWritebackRunUuid)
            .whereNotIn('status', [...AI_WRITEBACK_RUN_TERMINAL_STATUSES])
            .update({
                status,
                updated_at: this.database.fn.now() as unknown as Date,
            });
    }

    /**
     * Returns true if the update was applied, false if the run had already
     * reached a terminal status (e.g. a late timeout firing after the run
     * already succeeded).
     */
    async markReady(
        aiWritebackRunUuid: string,
        data: { branchName: string | null; prUrl: string | null },
    ): Promise<boolean> {
        const updatedRows = await this.database<AiWritebackRunTable>(
            AiWritebackRunTableName,
        )
            .where('ai_writeback_run_uuid', aiWritebackRunUuid)
            .whereNotIn('status', [...AI_WRITEBACK_RUN_TERMINAL_STATUSES])
            .update({
                status: 'ready',
                branch_name: data.branchName,
                pr_url: data.prUrl,
                updated_at: this.database.fn.now() as unknown as Date,
            });
        return updatedRows > 0;
    }

    async markError(
        aiWritebackRunUuid: string,
        errorMessage: string,
    ): Promise<boolean> {
        const updatedRows = await this.database<AiWritebackRunTable>(
            AiWritebackRunTableName,
        )
            .where('ai_writeback_run_uuid', aiWritebackRunUuid)
            .whereNotIn('status', [...AI_WRITEBACK_RUN_TERMINAL_STATUSES])
            .update({
                status: 'error',
                error_message: errorMessage,
                updated_at: this.database.fn.now() as unknown as Date,
            });
        return updatedRows > 0;
    }

    /** Persist the branch name as soon as it's known, ahead of the PR opening. */
    async setBranchName(
        aiWritebackRunUuid: string,
        branchName: string,
    ): Promise<void> {
        await this.database<AiWritebackRunTable>(AiWritebackRunTableName)
            .where('ai_writeback_run_uuid', aiWritebackRunUuid)
            .whereNotIn('status', [...AI_WRITEBACK_RUN_TERMINAL_STATUSES])
            .update({
                branch_name: branchName,
                updated_at: this.database.fn.now() as unknown as Date,
            });
    }
}
