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

    async create(data: {
        organizationUuid: string;
        projectUuid: string;
        aiThreadUuid: string | null;
        createdByUserUuid: string;
        source: AiWritebackSource;
        promptUuid: string | null;
        toolCallId: string | null;
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
                prompt_uuid: data.promptUuid,
                tool_call_id: data.toolCallId,
            })
            .returning('*');
        return row;
    }

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

    /**
     * Atomically mark every actively-running run whose last update predates the
     * threshold as errored, returning the rows it changed. A run only lingers in
     * a stage past the job's own timeout when the worker died (pod
     * crash/redeploy) before either the in-process catch or the timeout callback
     * could finalize it — this is the out-of-band recovery for that case. The
     * returned prompt/tool-call linkage lets the caller also un-stick the chat
     * card, not just the run row.
     *
     * 'pending' runs are deliberately excluded: a worker moves a run off
     * 'pending' the moment it picks it up, so a still-'pending' run has not been
     * started by any worker and is not a died-mid-run case to reclaim.
     */
    async markStaleRunsAsError(
        thresholdMinutes: number,
        errorMessage: string,
    ): Promise<DbAiWritebackRun[]> {
        return this.database<AiWritebackRunTable>(AiWritebackRunTableName)
            .whereNotIn('status', [
                ...AI_WRITEBACK_RUN_TERMINAL_STATUSES,
                'pending',
            ])
            .andWhere(
                'updated_at',
                '<',
                this.database.raw("now() - (? * interval '1 minute')", [
                    thresholdMinutes,
                ]),
            )
            .update({
                status: 'error',
                error_message: errorMessage,
                updated_at: this.database.fn.now() as unknown as Date,
            })
            .returning('*');
    }
}
