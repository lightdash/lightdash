import {
    AGENT_ONBOARDING_ACTIVE_STATUSES,
    AGENT_ONBOARDING_STAGES,
    type AgentOnboardingHandoff,
    type AgentOnboardingRunEvent,
    type AgentOnboardingStage,
    type AgentOnboardingUsage,
} from '@lightdash/common';
import { Knex } from 'knex';
import {
    AgentOnboardingRunsTable,
    AgentOnboardingRunsTableName,
    type DbAgentOnboardingFile,
    type DbAgentOnboardingRun,
} from '../database/entities/agentOnboarding';

type Dependencies = {
    database: Knex;
};

type CreateAgentOnboardingRun = {
    organizationUuid: string;
    projectUuid: string;
    createdByUserUuid: string;
};

type UpdateAgentOnboardingRun = Partial<
    Pick<
        DbAgentOnboardingRun,
        'pat_uuid' | 'sandbox_uuid' | 'usage' | 'handoff'
    >
>;

const activeStatusPlaceholders = AGENT_ONBOARDING_ACTIVE_STATUSES.map(
    () => '?',
).join(', ');

export class AgentOnboardingRunModel {
    private readonly database: Knex;

    constructor({ database }: Dependencies) {
        this.database = database;
    }

    private getMonotonicStageValue(stage: AgentOnboardingStage) {
        const stageIndex = AGENT_ONBOARDING_STAGES.indexOf(stage);
        const earlierStages = AGENT_ONBOARDING_STAGES.slice(0, stageIndex);

        if (earlierStages.length === 0) {
            return this.database.raw('COALESCE(??, ?)', ['stage', stage]);
        }

        const placeholders = earlierStages.map(() => '?').join(', ');
        return this.database.raw(
            `CASE WHEN ?? IS NULL OR ?? IN (${placeholders}) THEN ? ELSE ?? END`,
            ['stage', 'stage', ...earlierStages, stage, 'stage'],
        );
    }

    async create(
        data: CreateAgentOnboardingRun,
    ): Promise<DbAgentOnboardingRun> {
        const [run] = await this.database<AgentOnboardingRunsTable>(
            AgentOnboardingRunsTableName,
        )
            .insert({
                organization_uuid: data.organizationUuid,
                project_uuid: data.projectUuid,
                created_by_user_uuid: data.createdByUserUuid,
            })
            .onConflict(
                this.database.raw(
                    `(??) WHERE ?? IN (${activeStatusPlaceholders})`,
                    [
                        'project_uuid',
                        'status',
                        ...AGENT_ONBOARDING_ACTIVE_STATUSES,
                    ],
                ),
            )
            .merge({
                // Force RETURNING on conflict without changing lifecycle time.
                updated_at: this.database.raw('??.??', [
                    AgentOnboardingRunsTableName,
                    'updated_at',
                ]) as unknown as Date,
            })
            .returning('*');

        return run;
    }

    async findByUuid(
        agentOnboardingRunUuid: string,
    ): Promise<DbAgentOnboardingRun | undefined> {
        return this.database<AgentOnboardingRunsTable>(
            AgentOnboardingRunsTableName,
        )
            .where('agent_onboarding_run_uuid', agentOnboardingRunUuid)
            .first();
    }

    async findActiveRunForProject(
        projectUuid: string,
    ): Promise<DbAgentOnboardingRun | undefined> {
        return this.database<AgentOnboardingRunsTable>(
            AgentOnboardingRunsTableName,
        )
            .where('project_uuid', projectUuid)
            .whereIn('status', [...AGENT_ONBOARDING_ACTIVE_STATUSES])
            .first();
    }

    async claimQueuedRun(
        agentOnboardingRunUuid: string,
    ): Promise<DbAgentOnboardingRun | undefined> {
        const [run] = await this.database<AgentOnboardingRunsTable>(
            AgentOnboardingRunsTableName,
        )
            .where('agent_onboarding_run_uuid', agentOnboardingRunUuid)
            .where('status', 'queued')
            .whereNull('cancellation_requested_at')
            .update({
                status: 'running',
                started_at: this.database.fn.now() as unknown as Date,
                updated_at: this.database.fn.now() as unknown as Date,
            })
            .returning('*');

        return run;
    }

    async update(
        agentOnboardingRunUuid: string,
        patch: UpdateAgentOnboardingRun,
    ): Promise<boolean> {
        const updated = await this.database<AgentOnboardingRunsTable>(
            AgentOnboardingRunsTableName,
        )
            .where('agent_onboarding_run_uuid', agentOnboardingRunUuid)
            .whereIn('status', [...AGENT_ONBOARDING_ACTIVE_STATUSES])
            .update({
                ...patch,
                updated_at: this.database.fn.now() as unknown as Date,
            });

        return updated > 0;
    }

    async replaceFiles(
        agentOnboardingRunUuid: string,
        files: DbAgentOnboardingFile[],
    ): Promise<boolean> {
        const updated = await this.database<AgentOnboardingRunsTable>(
            AgentOnboardingRunsTableName,
        )
            .where('agent_onboarding_run_uuid', agentOnboardingRunUuid)
            .whereIn('status', [...AGENT_ONBOARDING_ACTIVE_STATUSES])
            .update({
                files: JSON.stringify(files),
                updated_at: this.database.fn.now() as unknown as Date,
            });

        return updated > 0;
    }

    async appendEvent(
        agentOnboardingRunUuid: string,
        event: Omit<AgentOnboardingRunEvent, 'createdAt'>,
    ): Promise<boolean> {
        const fullEvent: AgentOnboardingRunEvent = {
            ...event,
            createdAt: new Date().toISOString(),
        };
        const updated = await this.database<AgentOnboardingRunsTable>(
            AgentOnboardingRunsTableName,
        )
            .where('agent_onboarding_run_uuid', agentOnboardingRunUuid)
            .whereIn('status', [...AGENT_ONBOARDING_ACTIVE_STATUSES])
            .update({
                events: this.database.raw('events || ?::jsonb', [
                    JSON.stringify([fullEvent]),
                ]) as unknown as AgentOnboardingRunEvent[],
                ...(event.stage
                    ? {
                          stage: this.getMonotonicStageValue(
                              event.stage,
                          ) as unknown as AgentOnboardingStage,
                      }
                    : {}),
                updated_at: this.database.fn.now() as unknown as Date,
            });

        return updated > 0;
    }

    async markCompleted(
        agentOnboardingRunUuid: string,
        result: {
            handoff: AgentOnboardingHandoff | null;
            usage: AgentOnboardingUsage | null;
            stage: AgentOnboardingStage | null;
        },
    ): Promise<boolean> {
        const updated = await this.database<AgentOnboardingRunsTable>(
            AgentOnboardingRunsTableName,
        )
            .where('agent_onboarding_run_uuid', agentOnboardingRunUuid)
            .where('status', 'running')
            .whereNull('cancellation_requested_at')
            .update({
                status: 'completed',
                handoff: result.handoff,
                usage: result.usage,
                ...(result.stage
                    ? {
                          stage: this.getMonotonicStageValue(
                              result.stage,
                          ) as unknown as AgentOnboardingStage,
                      }
                    : {}),
                completed_at: this.database.fn.now() as unknown as Date,
                updated_at: this.database.fn.now() as unknown as Date,
            });

        return updated > 0;
    }

    async markFailed(
        agentOnboardingRunUuid: string,
        errorMessage: string,
    ): Promise<boolean> {
        const updated = await this.database<AgentOnboardingRunsTable>(
            AgentOnboardingRunsTableName,
        )
            .where('agent_onboarding_run_uuid', agentOnboardingRunUuid)
            .whereIn('status', [...AGENT_ONBOARDING_ACTIVE_STATUSES])
            .whereNull('cancellation_requested_at')
            .update({
                status: 'failed',
                error_message: errorMessage,
                completed_at: this.database.fn.now() as unknown as Date,
                updated_at: this.database.fn.now() as unknown as Date,
            });

        return updated > 0;
    }

    async markCancelled(agentOnboardingRunUuid: string): Promise<boolean> {
        const updated = await this.database<AgentOnboardingRunsTable>(
            AgentOnboardingRunsTableName,
        )
            .where('agent_onboarding_run_uuid', agentOnboardingRunUuid)
            .whereIn('status', [...AGENT_ONBOARDING_ACTIVE_STATUSES])
            .update({
                status: 'cancelled',
                completed_at: this.database.fn.now() as unknown as Date,
                updated_at: this.database.fn.now() as unknown as Date,
            });

        return updated > 0;
    }

    async requestCancellation(
        agentOnboardingRunUuid: string,
    ): Promise<DbAgentOnboardingRun | undefined> {
        return this.database.transaction(async (transaction) => {
            const now = transaction.fn.now() as unknown as Date;
            const [queuedRun] = await transaction<AgentOnboardingRunsTable>(
                AgentOnboardingRunsTableName,
            )
                .where('agent_onboarding_run_uuid', agentOnboardingRunUuid)
                .where('status', 'queued')
                .whereNull('cancellation_requested_at')
                .update({
                    status: 'cancelled',
                    cancellation_requested_at: now,
                    completed_at: now,
                    updated_at: now,
                })
                .returning('*');

            if (queuedRun) return queuedRun;

            const [runningRun] = await transaction<AgentOnboardingRunsTable>(
                AgentOnboardingRunsTableName,
            )
                .where('agent_onboarding_run_uuid', agentOnboardingRunUuid)
                .where('status', 'running')
                .whereNull('cancellation_requested_at')
                .update({
                    cancellation_requested_at: now,
                    updated_at: now,
                })
                .returning('*');

            if (runningRun) return runningRun;

            return transaction<AgentOnboardingRunsTable>(
                AgentOnboardingRunsTableName,
            )
                .where('agent_onboarding_run_uuid', agentOnboardingRunUuid)
                .first();
        });
    }
}
