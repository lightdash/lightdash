import {
    getManagedAgentScheduleCron,
    getManagedAgentScheduleOption,
    type CreateManagedAgentAction,
    type ManagedAgentAction,
    type ManagedAgentActionFilters,
    type ManagedAgentSettings,
    type UpdateManagedAgentSettings,
} from '@lightdash/common';
import { type Knex } from 'knex';
import type { EncryptionUtil } from '../../utils/EncryptionUtil/EncryptionUtil';
import {
    ManagedAgentActionsTableName,
    ManagedAgentSettingsTableName,
    type DbManagedAgentAction,
    type DbManagedAgentSettings,
} from '../database/entities/managedAgent';

export class ManagedAgentModel {
    private readonly database: Knex;

    private readonly encryptionUtil: EncryptionUtil;

    constructor({
        database,
        encryptionUtil,
    }: {
        database: Knex;
        encryptionUtil: EncryptionUtil;
    }) {
        this.database = database;
        this.encryptionUtil = encryptionUtil;
    }

    // --- Settings ---

    static mapDbSettings(row: DbManagedAgentSettings): ManagedAgentSettings {
        const scheduleCron = getManagedAgentScheduleCron(
            getManagedAgentScheduleOption(row.schedule_cron),
        );
        return {
            projectUuid: row.project_uuid,
            enabled: row.enabled,
            scheduleCron,
            enabledByUserUuid: row.enabled_by_user_uuid,
            slackChannelId: row.slack_channel_id,
            toolSettings: row.tool_settings ?? {},
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        };
    }

    async getServiceAccountToken(projectUuid: string): Promise<string | null> {
        const row = await this.database(ManagedAgentSettingsTableName)
            .where({ project_uuid: projectUuid })
            .select('service_account_token')
            .first();
        if (!row?.service_account_token) {
            return null;
        }
        return this.encryptionUtil.decrypt(row.service_account_token);
    }

    async setServiceAccountToken(
        projectUuid: string,
        token: string,
    ): Promise<void> {
        const encrypted = this.encryptionUtil.encrypt(token);
        await this.database(ManagedAgentSettingsTableName)
            .where({ project_uuid: projectUuid })
            .update({ service_account_token: encrypted });
    }

    async getAnthropicResourceIds(projectUuid: string): Promise<{
        agentId: string | null;
        agentConfigHash: string | null;
        agentVersion: number | null;
        environmentId: string | null;
        vaultId: string | null;
    }> {
        const row = await this.database(ManagedAgentSettingsTableName)
            .where({ project_uuid: projectUuid })
            .select(
                'anthropic_agent_id',
                'anthropic_agent_config_hash',
                'anthropic_agent_version',
                'anthropic_environment_id',
                'anthropic_vault_id',
            )
            .first();
        return {
            agentId: row?.anthropic_agent_id ?? null,
            agentConfigHash: row?.anthropic_agent_config_hash ?? null,
            agentVersion: row?.anthropic_agent_version ?? null,
            environmentId: row?.anthropic_environment_id ?? null,
            vaultId: row?.anthropic_vault_id ?? null,
        };
    }

    async setAnthropicAgentState(
        projectUuid: string,
        agentId: string,
        agentConfigHash: string,
        agentVersion: number,
    ): Promise<void> {
        await this.database(ManagedAgentSettingsTableName)
            .where({ project_uuid: projectUuid })
            .update({
                anthropic_agent_id: agentId,
                anthropic_agent_config_hash: agentConfigHash,
                anthropic_agent_version: agentVersion,
            });
    }

    async setAnthropicResourceIds(
        projectUuid: string,
        environmentId: string,
        vaultId: string,
    ): Promise<void> {
        await this.database(ManagedAgentSettingsTableName)
            .where({ project_uuid: projectUuid })
            .update({
                anthropic_environment_id: environmentId,
                anthropic_vault_id: vaultId,
            });
    }

    async getSettings(
        projectUuid: string,
    ): Promise<ManagedAgentSettings | null> {
        const row = await this.database(ManagedAgentSettingsTableName)
            .where({ project_uuid: projectUuid })
            .first();
        return row ? ManagedAgentModel.mapDbSettings(row) : null;
    }

    async upsertSettings(
        projectUuid: string,
        userUuid: string,
        update: UpdateManagedAgentSettings,
    ): Promise<ManagedAgentSettings> {
        const [row] = await this.database(ManagedAgentSettingsTableName)
            .insert({
                project_uuid: projectUuid,
                enabled: update.enabled ?? false,
                schedule_cron: getManagedAgentScheduleCron(update.schedule),
                enabled_by_user_uuid: update.enabled ? userUuid : null,
                slack_channel_id: update.slackChannelId ?? null,
                tool_settings: update.toolSettings ?? {},
                updated_at: new Date(),
            })
            .onConflict('project_uuid')
            .merge({
                enabled: update.enabled,
                ...(update.schedule !== undefined && {
                    schedule_cron: getManagedAgentScheduleCron(update.schedule),
                }),
                ...(update.slackChannelId !== undefined && {
                    slack_channel_id: update.slackChannelId,
                }),
                ...(update.toolSettings !== undefined && {
                    tool_settings: update.toolSettings,
                }),
                enabled_by_user_uuid: update.enabled ? userUuid : undefined,
                updated_at: new Date(),
            })
            .returning('*');
        return ManagedAgentModel.mapDbSettings(row);
    }

    async getEnabledProjects(): Promise<ManagedAgentSettings[]> {
        const rows = await this.database(ManagedAgentSettingsTableName).where({
            enabled: true,
        });
        return rows.map(ManagedAgentModel.mapDbSettings);
    }

    // --- Actions ---

    static mapDbAction(row: DbManagedAgentAction): ManagedAgentAction {
        return {
            actionUuid: row.action_uuid,
            projectUuid: row.project_uuid,
            sessionId: row.session_id,
            actionType: row.action_type as ManagedAgentAction['actionType'],
            targetType: row.target_type as ManagedAgentAction['targetType'],
            targetUuid: row.target_uuid,
            targetName: row.target_name,
            description: row.description,
            metadata: row.metadata,
            reversedAt: row.reversed_at,
            reversedByUserUuid: row.reversed_by_user_uuid,
            createdAt: row.created_at,
        };
    }

    async createAction(
        action: CreateManagedAgentAction,
    ): Promise<ManagedAgentAction> {
        const [row] = await this.database(ManagedAgentActionsTableName)
            .insert({
                project_uuid: action.projectUuid,
                session_id: action.sessionId,
                action_type: action.actionType,
                target_type: action.targetType,
                target_uuid: action.targetUuid,
                target_name: action.targetName,
                description: action.description,
                metadata: action.metadata,
            })
            .returning('*');
        return ManagedAgentModel.mapDbAction(row);
    }

    async getActions(
        projectUuid: string,
        filters: ManagedAgentActionFilters = {},
    ): Promise<ManagedAgentAction[]> {
        let query = this.database(ManagedAgentActionsTableName)
            .where({ project_uuid: projectUuid })
            .orderBy('created_at', 'desc');

        if (filters.date) {
            query = query.whereRaw('created_at::date = ?', [filters.date]);
        }
        if (filters.actionType) {
            query = query.where({ action_type: filters.actionType });
        }
        if (filters.sessionId) {
            query = query.where({ session_id: filters.sessionId });
        }

        const rows = await query;
        return rows.map(ManagedAgentModel.mapDbAction);
    }

    async getRecentActions(
        projectUuid: string,
        limit: number = 50,
    ): Promise<ManagedAgentAction[]> {
        const rows = await this.database(ManagedAgentActionsTableName)
            .where({ project_uuid: projectUuid })
            .orderBy('created_at', 'desc')
            .limit(limit);
        return rows.map(ManagedAgentModel.mapDbAction);
    }

    async getAction(actionUuid: string): Promise<ManagedAgentAction | null> {
        const row = await this.database(ManagedAgentActionsTableName)
            .where({ action_uuid: actionUuid })
            .first();
        return row ? ManagedAgentModel.mapDbAction(row) : null;
    }

    async reverseAction(
        actionUuid: string,
        userUuid: string,
    ): Promise<ManagedAgentAction> {
        const [row] = await this.database(ManagedAgentActionsTableName)
            .where({ action_uuid: actionUuid })
            .whereNull('reversed_at')
            .update({
                reversed_at: new Date(),
                reversed_by_user_uuid: userUuid,
            })
            .returning('*');
        if (!row) {
            throw new Error(
                `Action ${actionUuid} not found or already reversed`,
            );
        }
        return ManagedAgentModel.mapDbAction(row);
    }

    async getUserQuestions(
        projectUuid: string,
        days: number = 30,
        limit: number = 30,
    ): Promise<
        Array<{
            prompt: string;
            userName: string;
            createdAt: Date;
        }>
    > {
        const rows = await this.database('ai_prompt as p')
            .join('ai_thread as t', 't.ai_thread_uuid', 'p.ai_thread_uuid')
            .join('users as u', 'u.user_uuid', 'p.created_by_user_uuid')
            .join('projects as proj', 'proj.project_uuid', 't.project_uuid')
            .where('t.project_uuid', projectUuid)
            .where(
                'p.created_at',
                '>',
                this.database.raw(`now() - interval '${days} days'`),
            )
            .select(
                'p.prompt',
                this.database.raw(
                    `u.first_name || ' ' || u.last_name as user_name`,
                ),
                'p.created_at',
            )
            .orderBy('p.created_at', 'desc')
            .limit(limit);

        return rows.map(
            (r: { prompt: string; user_name: string; created_at: Date }) => ({
                prompt: r.prompt,
                userName: r.user_name,
                createdAt: r.created_at,
            }),
        );
    }

    async getChartCreatedAt(chartUuid: string): Promise<Date | null> {
        const row = await this.database('saved_queries')
            .where({ saved_query_uuid: chartUuid })
            .select('created_at')
            .first();
        return row?.created_at ?? null;
    }

    async getDashboardCreatedAt(dashboardUuid: string): Promise<Date | null> {
        const row = await this.database('dashboards')
            .where({ dashboard_uuid: dashboardUuid })
            .select('created_at')
            .first();
        return row?.created_at ?? null;
    }

    async getSlowQueries(
        projectUuid: string,
        thresholdMs: number = 2000,
        limit: number = 20,
    ): Promise<
        Array<{
            executionTimeMs: number;
            context: string;
            chartUuid: string | null;
            chartName: string | null;
            dashboardUuid: string | null;
            dashboardName: string | null;
            createdAt: Date;
        }>
    > {
        const rows = await this.database('query_history as qh')
            .leftJoin(
                'saved_queries as sq',
                this.database.raw(
                    `sq.saved_query_uuid = (qh.request_parameters->>'savedChartUuid')::uuid AND sq.deleted_at IS NULL`,
                ),
            )
            .leftJoin(
                'dashboards as d',
                this.database.raw(
                    `d.dashboard_uuid = (qh.request_parameters->>'dashboardUuid')::uuid AND d.deleted_at IS NULL`,
                ),
            )
            .where('qh.project_uuid', projectUuid)
            .where('qh.warehouse_execution_time_ms', '>=', thresholdMs)
            .where(
                'qh.created_at',
                '>',
                this.database.raw(`now() - interval '30 days'`),
            )
            .select(
                'qh.warehouse_execution_time_ms as execution_time_ms',
                'qh.context',
                this.database.raw(
                    `qh.request_parameters->>'savedChartUuid' as chart_uuid`,
                ),
                'sq.name as chart_name',
                this.database.raw(
                    `qh.request_parameters->>'dashboardUuid' as dashboard_uuid`,
                ),
                'd.name as dashboard_name',
                'qh.created_at',
            )
            .orderBy('qh.warehouse_execution_time_ms', 'desc')
            .limit(limit);

        return rows.map(
            (r: {
                execution_time_ms: number;
                context: string;
                chart_uuid: string | null;
                chart_name: string | null;
                dashboard_uuid: string | null;
                dashboard_name: string | null;
                created_at: Date;
            }) => ({
                executionTimeMs: r.execution_time_ms,
                context: r.context,
                chartUuid: r.chart_uuid,
                chartName: r.chart_name,
                dashboardUuid: r.dashboard_uuid,
                dashboardName: r.dashboard_name,
                createdAt: r.created_at,
            }),
        );
    }
}
