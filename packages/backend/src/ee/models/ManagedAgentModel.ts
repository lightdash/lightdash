import {
    getManagedAgentScheduleCron,
    getManagedAgentScheduleOption,
    ManagedAgentActionType,
    ManagedAgentProtectedEntityType,
    ManagedAgentRunStatus,
    resolveManagedAgentPolicy,
    type CreateManagedAgentAction,
    type ManagedAgentAction,
    type ManagedAgentActionFilters,
    type ManagedAgentProtection,
    type ManagedAgentProtectionLevel,
    type ManagedAgentRun,
    type ManagedAgentRunTriggeredBy,
    type ManagedAgentSettings,
    type UpdateManagedAgentSettings,
} from '@lightdash/common';
import { type Knex } from 'knex';
import { usersInProjectSql } from '../../models/AnalyticsModelSql';
import type { EncryptionUtil } from '../../utils/EncryptionUtil/EncryptionUtil';
import {
    ManagedAgentActionsTableName,
    ManagedAgentProtectionsTableName,
    ManagedAgentRunsTableName,
    ManagedAgentSettingsTableName,
    type DbManagedAgentActionWithReverser,
    type DbManagedAgentProtection,
    type DbManagedAgentRun,
    type DbManagedAgentSettings,
} from '../database/entities/managedAgent';
import {
    inactiveUsersSql,
    orphanedContentSql,
    preAggCandidateExploresSql,
    preAggMissStatsSql,
    preAggQueryShapesSql,
    unusedAgentsSql,
    type InactiveUserActivitySource,
    type OrphanedContentOwnerStatus,
    type UnusedAgentReason,
    type UnusedAgentRoutingSignal,
} from './ManagedAgentModelSql';

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

    static mapDbSettings(
        row: DbManagedAgentSettings,
        scopedSpaceUuids: string[],
    ): ManagedAgentSettings {
        return {
            projectUuid: row.project_uuid,
            enabled: row.enabled,
            schedule: getManagedAgentScheduleOption(row.schedule_cron),
            enabledByUserUuid: row.enabled_by_user_uuid,
            slackChannelId: row.slack_channel_id,
            toolSettings: row.tool_settings ?? {},
            policy: resolveManagedAgentPolicy(row.policy),
            scopedSpaceUuids,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        };
    }

    async getScopedSpaceUuids(projectUuid: string): Promise<string[]> {
        const rows = await this.database(ManagedAgentProtectionsTableName)
            .where({
                project_uuid: projectUuid,
                entity_type: ManagedAgentProtectedEntityType.SPACE,
            })
            .select('entity_uuid')
            .orderBy('created_at', 'asc');
        return rows.map((row) => row.entity_uuid);
    }

    // Replaces the whole space selection: mode and rows always change together
    async replaceSpaceScope(
        projectUuid: string,
        mode: 'all-except' | 'only',
        spaceUuids: string[],
        userUuid: string,
    ): Promise<void> {
        await this.database.transaction(async (trx) => {
            await trx(ManagedAgentProtectionsTableName)
                .where({
                    project_uuid: projectUuid,
                    entity_type: ManagedAgentProtectedEntityType.SPACE,
                })
                .delete();
            if (spaceUuids.length > 0) {
                await trx(ManagedAgentProtectionsTableName).insert(
                    spaceUuids.map((spaceUuid) => ({
                        project_uuid: projectUuid,
                        entity_type: ManagedAgentProtectedEntityType.SPACE,
                        entity_uuid: spaceUuid,
                        level: mode === 'all-except' ? 'excluded' : 'monitored',
                        created_by_user_uuid: userUuid,
                    })),
                );
            }
        });
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
        vaultConfigHash: string | null;
    }> {
        const row = await this.database(ManagedAgentSettingsTableName)
            .where({ project_uuid: projectUuid })
            .select(
                'anthropic_agent_id',
                'anthropic_agent_config_hash',
                'anthropic_agent_version',
                'anthropic_environment_id',
                'anthropic_vault_id',
                'anthropic_vault_config_hash',
            )
            .first();
        return {
            agentId: row?.anthropic_agent_id ?? null,
            agentConfigHash: row?.anthropic_agent_config_hash ?? null,
            agentVersion: row?.anthropic_agent_version ?? null,
            environmentId: row?.anthropic_environment_id ?? null,
            vaultId: row?.anthropic_vault_id ?? null,
            vaultConfigHash: row?.anthropic_vault_config_hash ?? null,
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
        vaultConfigHash: string,
    ): Promise<void> {
        await this.database(ManagedAgentSettingsTableName)
            .where({ project_uuid: projectUuid })
            .update({
                anthropic_environment_id: environmentId,
                anthropic_vault_id: vaultId,
                anthropic_vault_config_hash: vaultConfigHash,
            });
    }

    async getSettings(
        projectUuid: string,
    ): Promise<ManagedAgentSettings | null> {
        const row = await this.database(ManagedAgentSettingsTableName)
            .where({ project_uuid: projectUuid })
            .first();
        if (!row) {
            return null;
        }
        const scopedSpaceUuids = await this.getScopedSpaceUuids(projectUuid);
        return ManagedAgentModel.mapDbSettings(row, scopedSpaceUuids);
    }

    async upsertSettings(
        projectUuid: string,
        userUuid: string,
        update: UpdateManagedAgentSettings,
    ): Promise<ManagedAgentSettings> {
        // Policy is stored as sparse overrides; merge the partial update into
        // the stored overrides so unset fields keep tracking defaults.
        let mergedPolicy: Record<string, unknown> | undefined;
        if (update.policy !== undefined) {
            const existing = await this.database(ManagedAgentSettingsTableName)
                .where({ project_uuid: projectUuid })
                .select('policy')
                .first();
            mergedPolicy = { ...(existing?.policy ?? {}), ...update.policy };
        }
        const [row] = await this.database(ManagedAgentSettingsTableName)
            .insert({
                project_uuid: projectUuid,
                enabled: update.enabled ?? false,
                schedule_cron: getManagedAgentScheduleCron(update.schedule),
                enabled_by_user_uuid: update.enabled ? userUuid : null,
                slack_channel_id: update.slackChannelId ?? null,
                tool_settings: update.toolSettings ?? {},
                policy: mergedPolicy ?? {},
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
                ...(mergedPolicy !== undefined && {
                    policy: mergedPolicy,
                }),
                enabled_by_user_uuid: update.enabled ? userUuid : undefined,
                updated_at: new Date(),
            })
            .returning('*');
        const scopedSpaceUuids = await this.getScopedSpaceUuids(projectUuid);
        return ManagedAgentModel.mapDbSettings(row, scopedSpaceUuids);
    }

    async getEnabledProjects(): Promise<ManagedAgentSettings[]> {
        const rows = await this.database(ManagedAgentSettingsTableName).where({
            enabled: true,
        });
        return Promise.all(
            rows.map(async (row) =>
                ManagedAgentModel.mapDbSettings(
                    row,
                    await this.getScopedSpaceUuids(row.project_uuid),
                ),
            ),
        );
    }

    // --- Protections ---

    static mapDbProtection(
        row: DbManagedAgentProtection,
    ): ManagedAgentProtection {
        return {
            projectUuid: row.project_uuid,
            entityType: row.entity_type as ManagedAgentProtectedEntityType,
            entityUuid: row.entity_uuid,
            level: row.level as ManagedAgentProtectionLevel,
            createdByUserUuid: row.created_by_user_uuid,
            createdAt: row.created_at,
        };
    }

    async listProtections(
        projectUuid: string,
    ): Promise<ManagedAgentProtection[]> {
        const rows = await this.database(ManagedAgentProtectionsTableName)
            .where({ project_uuid: projectUuid })
            .orderBy('created_at', 'asc');
        return rows.map(ManagedAgentModel.mapDbProtection);
    }

    async findProtectionLevel(
        projectUuid: string,
        entityType: ManagedAgentProtectedEntityType,
        entityUuid: string,
    ): Promise<ManagedAgentProtectionLevel | null> {
        const row = await this.database(ManagedAgentProtectionsTableName)
            .where({
                project_uuid: projectUuid,
                entity_type: entityType,
                entity_uuid: entityUuid,
            })
            .select('level')
            .first();
        return row ? (row.level as ManagedAgentProtectionLevel) : null;
    }

    async upsertProtection(
        protection: Omit<ManagedAgentProtection, 'createdAt'>,
    ): Promise<void> {
        await this.database(ManagedAgentProtectionsTableName)
            .insert({
                project_uuid: protection.projectUuid,
                entity_type: protection.entityType,
                entity_uuid: protection.entityUuid,
                level: protection.level,
                created_by_user_uuid: protection.createdByUserUuid,
            })
            .onConflict(['project_uuid', 'entity_type', 'entity_uuid'])
            .merge({
                level: protection.level,
                created_by_user_uuid: protection.createdByUserUuid,
            });
    }

    async deleteProtection(
        projectUuid: string,
        entityType: ManagedAgentProtectedEntityType,
        entityUuid: string,
    ): Promise<void> {
        await this.database(ManagedAgentProtectionsTableName)
            .where({
                project_uuid: projectUuid,
                entity_type: entityType,
                entity_uuid: entityUuid,
            })
            .delete();
    }

    // --- Actions ---

    // Dedup for blocked-attempt visibility: one live blocked action per target
    async hasActiveBlockedActionForTarget(
        projectUuid: string,
        targetUuid: string,
    ): Promise<boolean> {
        const row = await this.database(ManagedAgentActionsTableName)
            .where({
                project_uuid: projectUuid,
                target_uuid: targetUuid,
                action_type: ManagedAgentActionType.BLOCKED,
            })
            .whereNull('reversed_at')
            .select('action_uuid')
            .first();
        return row !== undefined;
    }

    async findLatestActiveFlagCreatedAt(
        projectUuid: string,
        targetUuid: string,
    ): Promise<Date | null> {
        const row = await this.database(ManagedAgentActionsTableName)
            .where({ project_uuid: projectUuid, target_uuid: targetUuid })
            .whereIn('action_type', [
                ManagedAgentActionType.FLAGGED_STALE,
                ManagedAgentActionType.FLAGGED_BROKEN,
                ManagedAgentActionType.FLAGGED_SLOW,
            ])
            .whereNull('reversed_at')
            .orderBy('created_at', 'desc')
            .select('created_at')
            .first();
        return row?.created_at ?? null;
    }

    private actionsQuery() {
        return this.database(ManagedAgentActionsTableName)
            .leftJoin(
                'users as reversed_by',
                `${ManagedAgentActionsTableName}.reversed_by_user_uuid`,
                'reversed_by.user_uuid',
            )
            .select<DbManagedAgentActionWithReverser[]>([
                `${ManagedAgentActionsTableName}.*`,
                'reversed_by.first_name as reversed_by_first_name',
                'reversed_by.last_name as reversed_by_last_name',
            ]);
    }

    static mapDbAction(
        row: DbManagedAgentActionWithReverser,
    ): ManagedAgentAction {
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
            reversedByUser:
                row.reversed_by_user_uuid &&
                row.reversed_by_first_name !== null &&
                row.reversed_by_last_name !== null
                    ? {
                          userUuid: row.reversed_by_user_uuid,
                          firstName: row.reversed_by_first_name,
                          lastName: row.reversed_by_last_name,
                      }
                    : null,
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
                managed_agent_run_uuid: action.managedAgentRunUuid,
                action_type: action.actionType,
                target_type: action.targetType,
                target_uuid: action.targetUuid,
                target_name: action.targetName,
                description: action.description,
                metadata: action.metadata,
            })
            .returning('*');
        // New actions have no reverser yet
        return ManagedAgentModel.mapDbAction({
            ...row,
            reversed_by_first_name: null,
            reversed_by_last_name: null,
        });
    }

    async getActions(
        projectUuid: string,
        filters: ManagedAgentActionFilters = {},
    ): Promise<ManagedAgentAction[]> {
        let query = this.actionsQuery()
            .where(`${ManagedAgentActionsTableName}.project_uuid`, projectUuid)
            .orderBy(`${ManagedAgentActionsTableName}.created_at`, 'desc');

        if (filters.date) {
            query = query.whereRaw(
                `${ManagedAgentActionsTableName}.created_at::date = ?`,
                [filters.date],
            );
        }
        if (filters.dateFrom) {
            query = query.whereRaw(
                `${ManagedAgentActionsTableName}.created_at::date >= ?`,
                [filters.dateFrom],
            );
        }
        if (filters.dateTo) {
            query = query.whereRaw(
                `${ManagedAgentActionsTableName}.created_at::date <= ?`,
                [filters.dateTo],
            );
        }
        // Legacy single actionType is still part of the filters contract
        const actionTypes = [
            ...(filters.actionTypes ?? []),
            ...(filters.actionType ? [filters.actionType] : []),
        ];
        if (actionTypes.length > 0) {
            query = query.whereIn(
                `${ManagedAgentActionsTableName}.action_type`,
                actionTypes,
            );
        }
        if (filters.targetTypes && filters.targetTypes.length > 0) {
            query = query.whereIn(
                `${ManagedAgentActionsTableName}.target_type`,
                filters.targetTypes,
            );
        }
        if (filters.search) {
            const pattern = `%${filters.search.replace(
                /[\\%_]/g,
                (match) => `\\${match}`,
            )}%`;
            query = query.andWhere((builder) => {
                void builder
                    .whereILike(
                        `${ManagedAgentActionsTableName}.description`,
                        pattern,
                    )
                    .orWhereILike(
                        `${ManagedAgentActionsTableName}.target_name`,
                        pattern,
                    );
            });
        }
        if (filters.limit) {
            query = query.limit(filters.limit);
        }
        if (filters.sessionId) {
            query = query.where(
                `${ManagedAgentActionsTableName}.session_id`,
                filters.sessionId,
            );
        }
        if (filters.runUuid) {
            query = query.where(
                `${ManagedAgentActionsTableName}.managed_agent_run_uuid`,
                filters.runUuid,
            );
        }

        const rows = await query;
        return rows.map(ManagedAgentModel.mapDbAction);
    }

    async getRecentActions(
        projectUuid: string,
        limit: number = 50,
    ): Promise<ManagedAgentAction[]> {
        const rows = await this.actionsQuery()
            .where(`${ManagedAgentActionsTableName}.project_uuid`, projectUuid)
            .orderBy(`${ManagedAgentActionsTableName}.created_at`, 'desc')
            .limit(limit);
        return rows.map(ManagedAgentModel.mapDbAction);
    }

    async getAction(actionUuid: string): Promise<ManagedAgentAction | null> {
        const row = await this.actionsQuery()
            .where(`${ManagedAgentActionsTableName}.action_uuid`, actionUuid)
            .first();
        return row ? ManagedAgentModel.mapDbAction(row) : null;
    }

    async reverseAction(
        actionUuid: string,
        userUuid: string,
    ): Promise<ManagedAgentAction> {
        const updated = await this.database(ManagedAgentActionsTableName)
            .where({ action_uuid: actionUuid })
            .whereNull('reversed_at')
            .update({
                reversed_at: new Date(),
                reversed_by_user_uuid: userUuid,
            });
        if (updated === 0) {
            throw new Error(
                `Action ${actionUuid} not found or already reversed`,
            );
        }
        const action = await this.getAction(actionUuid);
        if (!action) {
            throw new Error(`Action ${actionUuid} disappeared after reversal`);
        }
        return action;
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

    async isContentVerified(
        contentType: 'chart' | 'dashboard',
        contentUuid: string,
    ): Promise<boolean> {
        const row = await this.database('content_verification')
            .where({ content_type: contentType, content_uuid: contentUuid })
            .select('content_verification_uuid')
            .first();
        return row !== undefined;
    }

    async getChartSpaceUuid(chartUuid: string): Promise<string | null> {
        const row = await this.database('saved_queries as sq')
            .leftJoin('spaces as s', 's.space_id', 'sq.space_id')
            .where('sq.saved_query_uuid', chartUuid)
            .select('s.space_uuid')
            .first();
        return row?.space_uuid ?? null;
    }

    async getDashboardSpaceUuid(dashboardUuid: string): Promise<string | null> {
        const row = await this.database('dashboards as d')
            .leftJoin('spaces as s', 's.space_id', 'd.space_id')
            .where('d.dashboard_uuid', dashboardUuid)
            .select('s.space_uuid')
            .first();
        return row?.space_uuid ?? null;
    }

    // Latest of creation and last edit; a chart being actively edited is not
    // eligible for cleanup even if it has never been viewed.
    async getChartLastModifiedAt(chartUuid: string): Promise<Date | null> {
        const row = await this.database('saved_queries as sq')
            .leftJoin(
                'saved_queries_versions as v',
                'v.saved_query_id',
                'sq.saved_query_id',
            )
            .where('sq.saved_query_uuid', chartUuid)
            .groupBy('sq.saved_query_id', 'sq.created_at')
            .select(
                this.database.raw(
                    'GREATEST(sq.created_at, MAX(v.created_at)) as last_modified_at',
                ),
            )
            .first();
        return row?.last_modified_at ?? null;
    }

    async getDashboardLastModifiedAt(
        dashboardUuid: string,
    ): Promise<Date | null> {
        const row = await this.database('dashboards as d')
            .leftJoin(
                'dashboard_versions as dv',
                'dv.dashboard_id',
                'd.dashboard_id',
            )
            .where('d.dashboard_uuid', dashboardUuid)
            .groupBy('d.dashboard_id', 'd.created_at')
            .select(
                this.database.raw(
                    'GREATEST(d.created_at, MAX(dv.created_at)) as last_modified_at',
                ),
            )
            .first();
        return row?.last_modified_at ?? null;
    }

    // Last-seen is the newest of the three project-scoped signals we record for
    // a human: viewing a chart, viewing a dashboard, running a query.
    async getInactiveUsers(
        projectUuid: string,
        organizationUuid: string,
        inactiveDays: number,
        limit: number = 30,
    ): Promise<
        Array<{
            userUuid: string;
            userName: string;
            email: string | null;
            role: string;
            lastActiveAt: Date | null;
            lastActiveSource: InactiveUserActivitySource | null;
        }>
    > {
        const membership = await this.database.raw<{
            rows: Array<{ user_uuid: string; role: string }>;
        }>(usersInProjectSql(projectUuid, organizationUuid));
        const memberUuids = membership.rows.map((row) => row.user_uuid);
        if (memberUuids.length === 0) return [];

        const roleByUserUuid = new Map(
            membership.rows.map((row) => [row.user_uuid, row.role]),
        );
        const memberUuidList = memberUuids.join(',');

        const rows = await this.database.raw<{
            rows: Array<{
                user_uuid: string;
                user_name: string;
                email: string | null;
                last_active_at: Date | null;
                last_active_source: InactiveUserActivitySource | null;
            }>;
        }>(inactiveUsersSql(), [
            memberUuidList,
            projectUuid,
            memberUuidList,
            projectUuid,
            memberUuidList,
            projectUuid,
            memberUuidList,
            inactiveDays,
            inactiveDays,
            limit,
        ]);

        return rows.rows.map((r) => ({
            userUuid: r.user_uuid,
            userName: r.user_name,
            email: r.email,
            role: roleByUserUuid.get(r.user_uuid) ?? 'unknown',
            lastActiveAt: r.last_active_at,
            lastActiveSource: r.last_active_source,
        }));
    }

    // Owner follows the same convention the stale-content queries use: a chart's
    // last version author, a dashboard's first version author.
    async getOrphanedContent(
        projectUuid: string,
        organizationUuid: string,
        limit: number = 30,
    ): Promise<
        Array<{
            contentType: 'chart' | 'dashboard';
            contentUuid: string;
            contentName: string;
            spaceUuid: string | null;
            ownerUserUuid: string;
            ownerName: string;
            ownerStatus: OrphanedContentOwnerStatus;
            lastViewedAt: Date | null;
        }>
    > {
        const rows = await this.database.raw<{
            rows: Array<{
                content_type: 'chart' | 'dashboard';
                content_uuid: string;
                content_name: string;
                space_uuid: string | null;
                owner_user_uuid: string;
                owner_name: string;
                owner_status: OrphanedContentOwnerStatus;
                last_viewed_at: Date | null;
            }>;
        }>(orphanedContentSql(), [
            organizationUuid,
            projectUuid,
            projectUuid,
            limit,
        ]);

        return rows.rows.map((r) => ({
            contentType: r.content_type,
            contentUuid: r.content_uuid,
            contentName: r.content_name,
            spaceUuid: r.space_uuid,
            ownerUserUuid: r.owner_user_uuid,
            ownerName: r.owner_name,
            ownerStatus: r.owner_status,
            lastViewedAt: r.last_viewed_at,
        }));
    }

    // Traffic is counted in prompts rather than threads, so an agent someone
    // opened and never spoke to does not read as used.
    async getUnusedAgents(
        projectUuid: string,
        organizationUuid: string,
        windowDays: number,
        minPrompts: number,
        limit: number = 30,
    ): Promise<
        Array<{
            agentUuid: string;
            agentName: string;
            createdAt: Date;
            adminOnly: boolean;
            totalThreads: number;
            recentThreads: number;
            totalPrompts: number;
            recentPrompts: number;
            recentAnswered: number;
            recentAskers: number;
            lastUsedAt: Date | null;
            reason: UnusedAgentReason;
            routingSignal: UnusedAgentRoutingSignal;
            routedCandidateCount: number;
            routedSuggestedCount: number;
            routedChosenCount: number;
        }>
    > {
        const rows = await this.database.raw<{
            rows: Array<{
                agent_uuid: string;
                agent_name: string;
                created_at: Date;
                admin_only: boolean;
                total_threads: string;
                recent_threads: string;
                total_prompts: string;
                recent_prompts: string;
                recent_answered: string;
                recent_askers: string;
                last_used_at: Date | null;
                reason: UnusedAgentReason;
                routing_signal: UnusedAgentRoutingSignal;
                routed_candidate_count: string;
                routed_suggested_count: string;
                routed_chosen_count: string;
            }>;
        }>(unusedAgentsSql(), [
            windowDays,
            minPrompts,
            projectUuid,
            organizationUuid,
            projectUuid,
            limit,
        ]);

        return rows.rows.map((r) => ({
            agentUuid: r.agent_uuid,
            agentName: r.agent_name,
            createdAt: r.created_at,
            adminOnly: r.admin_only,
            totalThreads: Number(r.total_threads),
            recentThreads: Number(r.recent_threads),
            totalPrompts: Number(r.total_prompts),
            recentPrompts: Number(r.recent_prompts),
            recentAnswered: Number(r.recent_answered),
            recentAskers: Number(r.recent_askers),
            lastUsedAt: r.last_used_at,
            reason: r.reason,
            routingSignal: r.routing_signal,
            routedCandidateCount: Number(r.routed_candidate_count),
            routedSuggestedCount: Number(r.routed_suggested_count),
            routedChosenCount: Number(r.routed_chosen_count),
        }));
    }

    async getPreAggCandidateExplores(
        projectUuid: string,
        windowDays: number,
        minQueries: number,
        limit: number = 10,
    ): Promise<
        Array<{
            exploreName: string;
            queryCount: number;
            distinctUsers: number;
            totalExecutionMs: number;
            avgExecutionMs: number;
            p95ExecutionMs: number;
            preAggHitCount: number;
            contextCounts: Record<string, number>;
        }>
    > {
        const rows = await this.database.raw<{
            rows: Array<{
                explore_name: string;
                query_count: string;
                distinct_users: string;
                total_execution_ms: string;
                avg_execution_ms: string;
                p95_execution_ms: string;
                preagg_hit_count: string;
                context_counts: Record<string, number> | null;
            }>;
        }>(preAggCandidateExploresSql(), [
            windowDays,
            minQueries,
            projectUuid,
            limit,
        ]);

        return rows.rows.map((r) => ({
            exploreName: r.explore_name,
            queryCount: Number(r.query_count),
            distinctUsers: Number(r.distinct_users),
            totalExecutionMs: Number(r.total_execution_ms),
            avgExecutionMs: Number(r.avg_execution_ms),
            p95ExecutionMs: Number(r.p95_execution_ms),
            preAggHitCount: Number(r.preagg_hit_count),
            contextCounts: r.context_counts ?? {},
        }));
    }

    async getPreAggQueryShapes(
        projectUuid: string,
        exploreNames: string[],
        windowDays: number,
        shapesPerExplore: number,
    ): Promise<
        Array<{
            exploreName: string;
            dimensionFieldIds: string[];
            metricFieldIds: string[];
            filterFieldIds: string[];
            hasCustomFields: boolean;
            queryCount: number;
            avgExecutionMs: number;
            totalExecutionMs: number;
        }>
    > {
        if (exploreNames.length === 0) {
            return [];
        }

        const rows = await this.database.raw<{
            rows: Array<{
                explore_name: string;
                dimension_field_ids: string[];
                metric_field_ids: string[];
                filter_field_id_sets: string[][];
                has_custom_fields: boolean;
                query_count: string;
                avg_execution_ms: string;
                total_execution_ms: string;
            }>;
        }>(preAggQueryShapesSql(), [
            windowDays,
            projectUuid,
            exploreNames.join(','),
            shapesPerExplore,
        ]);

        return rows.rows.map((r) => ({
            exploreName: r.explore_name,
            dimensionFieldIds: r.dimension_field_ids,
            metricFieldIds: r.metric_field_ids,
            filterFieldIds: Array.from(new Set(r.filter_field_id_sets.flat())),
            hasCustomFields: r.has_custom_fields,
            queryCount: Number(r.query_count),
            avgExecutionMs: Number(r.avg_execution_ms),
            totalExecutionMs: Number(r.total_execution_ms),
        }));
    }

    async getPreAggMissStats(
        projectUuid: string,
        windowDays: number,
    ): Promise<
        Array<{
            exploreName: string;
            missReason: string | null;
            hitCount: number;
            missCount: number;
        }>
    > {
        const rows = await this.database.raw<{
            rows: Array<{
                explore_name: string;
                miss_reason: string | null;
                hit_count: string;
                miss_count: string;
            }>;
        }>(preAggMissStatsSql(), [windowDays, projectUuid]);

        return rows.rows.map((r) => ({
            exploreName: r.explore_name,
            missReason: r.miss_reason,
            hitCount: Number(r.hit_count),
            missCount: Number(r.miss_count),
        }));
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

    // --- Runs ---

    // Defensive: a run row stuck in 'started' for this long is treated as
    // errored at read time. Covers worker-pod crashes between createRun and
    // finishRun that would otherwise leave the row (and the play button)
    // locked forever.
    private static readonly STALE_RUN_THRESHOLD_MS = 15 * 60 * 1000;

    // Backfilled historical runs (see 20260507114958_backfill_managed_agent_runs.ts)
    // tag `error` with this sentinel so the down migration can distinguish them
    // from future legitimate runs that happen to share the same fingerprint.
    // We strip the sentinel here so it never reaches the API or UI.
    private static readonly BACKFILL_ERROR_MARKER = '__backfilled__';

    static mapDbRun(
        row: DbManagedAgentRun & {
            action_counts_by_type?: Record<string, number> | null;
        },
    ): ManagedAgentRun {
        const rawStatus = row.status as ManagedAgentRunStatus;
        const isStale =
            rawStatus === ManagedAgentRunStatus.STARTED &&
            row.started_at.getTime() <
                Date.now() - ManagedAgentModel.STALE_RUN_THRESHOLD_MS;
        // Synthesised finish for stale runs: pin to started_at + threshold
        // (the latest moment the run could plausibly have been alive).
        // Using `new Date()` instead would shift on every read, breaking
        // duration display; using `started_at` would imply 0 duration.
        const synthesisedFinishedAt = new Date(
            row.started_at.getTime() + ManagedAgentModel.STALE_RUN_THRESHOLD_MS,
        );
        const cleanError =
            row.error === ManagedAgentModel.BACKFILL_ERROR_MARKER
                ? null
                : row.error;
        return {
            runUuid: row.managed_agent_run_uuid,
            projectUuid: row.project_uuid,
            triggeredBy: row.triggered_by as ManagedAgentRunTriggeredBy,
            status: isStale ? ManagedAgentRunStatus.ERROR : rawStatus,
            sessionId: row.session_id,
            startedAt: row.started_at,
            finishedAt:
                isStale && !row.finished_at
                    ? synthesisedFinishedAt
                    : row.finished_at,
            actionCount: row.action_count,
            actionCountsByType:
                (row.action_counts_by_type as ManagedAgentRun['actionCountsByType']) ??
                {},
            summary: row.summary,
            error: isStale
                ? (cleanError ?? 'Run timed out. The worker may have crashed')
                : cleanError,
            currentActivity: row.current_activity,
        };
    }

    async createRun(input: {
        projectUuid: string;
        triggeredBy: ManagedAgentRunTriggeredBy;
    }): Promise<ManagedAgentRun> {
        const [row] = await this.database(ManagedAgentRunsTableName)
            .insert({
                project_uuid: input.projectUuid,
                triggered_by: input.triggeredBy,
                status: ManagedAgentRunStatus.STARTED,
            })
            .returning('*');
        return ManagedAgentModel.mapDbRun(row);
    }

    async setRunSessionId(runUuid: string, sessionId: string): Promise<void> {
        await this.database(ManagedAgentRunsTableName)
            .where({ managed_agent_run_uuid: runUuid })
            .update({ session_id: sessionId });
    }

    async setCurrentActivity(
        runUuid: string,
        activity: string | null,
    ): Promise<void> {
        await this.database(ManagedAgentRunsTableName)
            .where({ managed_agent_run_uuid: runUuid })
            .update({ current_activity: activity });
    }

    async finishRun(
        runUuid: string,
        update: {
            status:
                | ManagedAgentRunStatus.COMPLETED
                | ManagedAgentRunStatus.ERROR;
            actionCount: number;
            summary: string | null;
            error: string | null;
        },
    ): Promise<void> {
        await this.database(ManagedAgentRunsTableName)
            .where({ managed_agent_run_uuid: runUuid })
            .update({
                status: update.status,
                finished_at: new Date(),
                action_count: update.actionCount,
                summary: update.summary,
                error: update.error,
                current_activity: null,
            });
    }

    async countActionsForRun(runUuid: string): Promise<number> {
        const result = await this.database(ManagedAgentActionsTableName)
            .where({ managed_agent_run_uuid: runUuid })
            .count<{ count: string }[]>('* as count')
            .first();
        return result ? Number(result.count) : 0;
    }

    // Bulk deletions (metadata.bulk = true) have their own per-call cap, so
    // they are excluded from the individual soft-delete run cap
    async countNonBulkSoftDeletesForRun(runUuid: string): Promise<number> {
        const [row] = await this.database(ManagedAgentActionsTableName)
            .where({
                managed_agent_run_uuid: runUuid,
                action_type: ManagedAgentActionType.SOFT_DELETED,
            })
            .whereRaw(`COALESCE(metadata->>'bulk', '') <> 'true'`)
            .count<{ count: string }[]>('* as count');
        return Number(row?.count ?? 0);
    }

    async getActionCountsByTypeForRun(
        runUuid: string,
    ): Promise<Record<string, number>> {
        const rows = await this.database(ManagedAgentActionsTableName)
            .where({ managed_agent_run_uuid: runUuid })
            .groupBy('action_type')
            .select<{ action_type: string; count: string }[]>(
                'action_type',
                this.database.raw('COUNT(*) AS count'),
            );
        return Object.fromEntries(
            rows.map(({ action_type, count }) => [action_type, Number(count)]),
        );
    }

    async getRun(runUuid: string): Promise<ManagedAgentRun | null> {
        const row = await this.database(ManagedAgentRunsTableName)
            .where({ managed_agent_run_uuid: runUuid })
            .first();
        return row ? ManagedAgentModel.mapDbRun(row) : null;
    }

    async getLatestRun(projectUuid: string): Promise<ManagedAgentRun | null> {
        const row = await this.database(ManagedAgentRunsTableName)
            .where({ project_uuid: projectUuid })
            .orderBy('started_at', 'desc')
            .first();
        return row ? ManagedAgentModel.mapDbRun(row) : null;
    }

    async getRuns(
        projectUuid: string,
        opts: {
            limit: number;
            cursor: { startedAt: Date; runUuid: string } | null;
        },
    ): Promise<{
        runs: ManagedAgentRun[];
        nextCursor: { startedAt: Date; runUuid: string } | null;
    }> {
        let query = this.database(ManagedAgentRunsTableName)
            .where({ project_uuid: projectUuid })
            .orderBy([
                { column: 'started_at', order: 'desc' },
                { column: 'managed_agent_run_uuid', order: 'desc' },
            ])
            .limit(opts.limit + 1)
            .select(
                `${ManagedAgentRunsTableName}.*`,
                this.database.raw(
                    `(SELECT json_object_agg(action_type, cnt) FROM (
                        SELECT action_type, COUNT(*) AS cnt
                        FROM ${ManagedAgentActionsTableName}
                        WHERE managed_agent_run_uuid = ${ManagedAgentRunsTableName}.managed_agent_run_uuid
                        GROUP BY action_type
                    ) sub) AS action_counts_by_type`,
                ),
            );
        if (opts.cursor) {
            query = query.whereRaw(
                '(started_at, managed_agent_run_uuid) < (?, ?)',
                [opts.cursor.startedAt, opts.cursor.runUuid],
            );
        }
        const rows: (DbManagedAgentRun & {
            action_counts_by_type: Record<string, number> | null;
        })[] = await query;
        const hasMore = rows.length > opts.limit;
        const page = hasMore ? rows.slice(0, opts.limit) : rows;
        const last = hasMore ? page[page.length - 1] : null;
        return {
            runs: page.map(ManagedAgentModel.mapDbRun),
            nextCursor: last
                ? {
                      startedAt: last.started_at,
                      runUuid: last.managed_agent_run_uuid,
                  }
                : null,
        };
    }
}
