import { subject } from '@casl/ability';
import {
    FeatureFlags,
    ForbiddenError,
    getFixedBrokenMetadata,
    getManagedAgentActionCategory,
    getManagedAgentScheduleCron,
    ManagedAgentActionType,
    ManagedAgentRunStatus,
    ManagedAgentTargetType,
    NotFoundError,
    ParameterError,
    ProjectType,
    ServiceAccountScope,
    type ChartConfig,
    type ManagedAgentAction,
    type ManagedAgentActionFilters,
    type ManagedAgentRun,
    type ManagedAgentRunsListResponse,
    type ManagedAgentRunTriggeredBy,
    type ManagedAgentSettings,
    type MetricQuery,
    type SavedChart,
    type SessionUser,
    type UpdateManagedAgentSettings,
    type ValidationResponse,
} from '@lightdash/common';
import type { KnownBlock } from '@slack/bolt';
import type { LightdashAnalytics } from '../../../analytics/LightdashAnalytics';
import type { SlackClient } from '../../../clients/Slack/SlackClient';
import type { LightdashConfig } from '../../../config/parseConfig';
import type { AnalyticsModel } from '../../../models/AnalyticsModel';
import type { DashboardModel } from '../../../models/DashboardModel/DashboardModel';
import type { FeatureFlagModel } from '../../../models/FeatureFlagModel/FeatureFlagModel';
import type { OrganizationModel } from '../../../models/OrganizationModel';
import type { ProjectModel } from '../../../models/ProjectModel/ProjectModel';
import type { SavedChartModel } from '../../../models/SavedChartModel';
import type { SpaceModel } from '../../../models/SpaceModel';
import type { UserModel } from '../../../models/UserModel';
import type { ValidationModel } from '../../../models/ValidationModel/ValidationModel';
import { SchedulerClient } from '../../../scheduler/SchedulerClient';
import { BaseService } from '../../../services/BaseService';
import {
    ManagedAgentClient,
    type ManagedAgentSessionConfig,
} from '../../clients/ManagedAgentClient';
import { ManagedAgentModel } from '../../models/ManagedAgentModel';
import type { ServiceAccountModel } from '../../models/ServiceAccountModel';

type RunsCursor = { startedAt: Date; runUuid: string };

const encodeRunsCursor = (cursor: RunsCursor | null): string | null => {
    if (!cursor) return null;
    return Buffer.from(
        JSON.stringify({
            startedAt: cursor.startedAt.toISOString(),
            runUuid: cursor.runUuid,
        }),
    ).toString('base64');
};

const decodeRunsCursor = (raw: string | null): RunsCursor | null => {
    if (!raw) return null;
    try {
        const decoded = JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
        if (
            typeof decoded?.startedAt !== 'string' ||
            typeof decoded?.runUuid !== 'string'
        ) {
            return null;
        }
        return {
            startedAt: new Date(decoded.startedAt),
            runUuid: decoded.runUuid,
        };
    } catch {
        return null;
    }
};

const FRIENDLY_TOOL_LABELS: Record<string, string> = {
    get_recent_actions: 'Reviewing recent activity',
    get_stale_charts: 'Looking for stale charts',
    get_stale_dashboards: 'Looking for stale dashboards',
    get_broken_content: 'Looking for broken content',
    get_preview_projects: 'Inspecting preview projects',
    get_popular_content: 'Checking popular content',
    get_chart_details: 'Inspecting chart details',
    get_chart_schema: 'Loading chart schema',
    flag_content: 'Flagging content',
    soft_delete_content: 'Cleaning up stale content',
    log_insight: 'Logging an insight',
    fix_broken_chart: 'Fixing a broken chart',
    create_content_from_code: 'Creating chart suggestion',
    get_user_questions: 'Reviewing user questions',
    get_slow_queries: 'Checking slow queries',
    reverse_own_action: 'Reverting earlier change',
};

const friendlyToolLabel = (toolName: string): string =>
    FRIENDLY_TOOL_LABELS[toolName] ?? `Running ${toolName}`;

type ManagedAgentServiceDependencies = {
    lightdashConfig: LightdashConfig;
    analytics: LightdashAnalytics;
    managedAgentModel: ManagedAgentModel;
    analyticsModel: AnalyticsModel;
    organizationModel: OrganizationModel;
    projectModel: ProjectModel;
    validationModel: ValidationModel;
    savedChartModel: SavedChartModel;
    dashboardModel: DashboardModel;
    spaceModel: SpaceModel;
    userModel: UserModel;
    featureFlagModel: FeatureFlagModel;
    serviceAccountModel: ServiceAccountModel;
    schedulerClient: SchedulerClient;
    slackClient: SlackClient;
    managedAgentClient: ManagedAgentClient;
};

export class ManagedAgentService extends BaseService {
    private readonly lightdashConfig: LightdashConfig;

    private readonly analytics: LightdashAnalytics;

    private readonly managedAgentModel: ManagedAgentModel;

    private readonly analyticsModel: AnalyticsModel;

    private readonly organizationModel: OrganizationModel;

    private readonly projectModel: ProjectModel;

    private readonly validationModel: ValidationModel;

    private readonly savedChartModel: SavedChartModel;

    private readonly dashboardModel: DashboardModel;

    private readonly spaceModel: SpaceModel;

    private readonly userModel: UserModel;

    private readonly featureFlagModel: FeatureFlagModel;

    private readonly serviceAccountModel: ServiceAccountModel;

    private readonly schedulerClient: SchedulerClient;

    private readonly slackClient: SlackClient;

    private readonly managedAgentClient: ManagedAgentClient;

    constructor(deps: ManagedAgentServiceDependencies) {
        super();
        this.lightdashConfig = deps.lightdashConfig;
        this.analytics = deps.analytics;
        this.managedAgentModel = deps.managedAgentModel;
        this.analyticsModel = deps.analyticsModel;
        this.organizationModel = deps.organizationModel;
        this.projectModel = deps.projectModel;
        this.validationModel = deps.validationModel;
        this.savedChartModel = deps.savedChartModel;
        this.dashboardModel = deps.dashboardModel;
        this.spaceModel = deps.spaceModel;
        this.userModel = deps.userModel;
        this.featureFlagModel = deps.featureFlagModel;
        this.serviceAccountModel = deps.serviceAccountModel;
        this.schedulerClient = deps.schedulerClient;
        this.slackClient = deps.slackClient;
        this.managedAgentClient = deps.managedAgentClient;
    }

    // --- Validation helpers ---

    private static validateEnum<T extends string>(
        value: unknown,
        enumObj: Record<string, T>,
        fieldName: string,
    ): T {
        const valid = Object.values(enumObj);
        if (!valid.includes(value as T)) {
            throw new Error(
                `Invalid ${fieldName}: "${value}". Must be one of: ${valid.join(', ')}`,
            );
        }
        return value as T;
    }

    private static assertProjectOwnership(
        entityProjectUuid: string,
        expectedProjectUuid: string,
        entityType: string,
        entityUuid: string,
    ): void {
        if (entityProjectUuid !== expectedProjectUuid) {
            throw new ForbiddenError(
                `${entityType} ${entityUuid} does not belong to project ${expectedProjectUuid}`,
            );
        }
    }

    private static readonly VALID_CHART_CONFIG_TYPES = new Set([
        'cartesian',
        'table',
        'big_number',
        'pie',
        'funnel',
        'gauge',
        'treemap',
        'map',
    ]);

    private static validateChartPayload(
        metricQuery: unknown,
        chartConfig: unknown,
        tableName?: unknown,
    ): void {
        if (!metricQuery || typeof metricQuery !== 'object') {
            throw new Error('metric_query must be a non-null object');
        }
        if (!chartConfig || typeof chartConfig !== 'object') {
            throw new Error('chart_config must be a non-null object');
        }
        const config = chartConfig as Record<string, unknown>;
        if (
            config.type &&
            !ManagedAgentService.VALID_CHART_CONFIG_TYPES.has(
                config.type as string,
            )
        ) {
            throw new Error(
                `Invalid chartConfig.type: "${config.type}". Must be one of: ${[...ManagedAgentService.VALID_CHART_CONFIG_TYPES].join(', ')}`,
            );
        }
        const mq = metricQuery as Record<string, unknown>;
        if (!Array.isArray(mq.dimensions)) {
            throw new Error('metric_query.dimensions must be an array');
        }
        if (!Array.isArray(mq.metrics)) {
            throw new Error('metric_query.metrics must be an array');
        }
        if (tableName !== undefined && typeof tableName !== 'string') {
            throw new Error('tableName must be a string');
        }
    }

    private async getSessionConfig(
        projectUuid: string,
        serviceAccountToken: string,
    ): Promise<ManagedAgentSessionConfig> {
        const {
            agentId,
            agentConfigHash,
            agentVersion,
            environmentId,
            vaultId,
        } = await this.managedAgentModel.getAnthropicResourceIds(projectUuid);
        const project = await this.projectModel.getSummary(projectUuid);
        const organization = await this.organizationModel.get(
            project.organizationUuid,
        );
        const settings = await this.managedAgentModel.getSettings(projectUuid);

        return {
            serviceAccountPat: serviceAccountToken,
            resourceName: `${organization.name}:${organization.organizationUuid}:${project.projectUuid}`,
            skillIds: this.lightdashConfig.managedAgent.skillIds,
            toolSettings: settings?.toolSettings ?? {},
            persistedAgentId: agentId,
            persistedAgentConfigHash: agentConfigHash,
            persistedAgentVersion: agentVersion,
            persistedEnvironmentId: environmentId,
            persistedVaultId: vaultId,
            onAgentSynced: async (
                newAgentId,
                newAgentConfigHash,
                newAgentVersion,
            ) => {
                await this.managedAgentModel.setAnthropicAgentState(
                    projectUuid,
                    newAgentId,
                    newAgentConfigHash,
                    newAgentVersion,
                );
            },
            onResourcesCreated: async (newEnvId, newVaultId) => {
                await this.managedAgentModel.setAnthropicResourceIds(
                    projectUuid,
                    newEnvId,
                    newVaultId,
                );
            },
        };
    }

    private async syncProjectAgentConfig(projectUuid: string): Promise<void> {
        const serviceAccountToken =
            await this.managedAgentModel.getServiceAccountToken(projectUuid);

        if (!serviceAccountToken) {
            return;
        }

        const sessionConfig = await this.getSessionConfig(
            projectUuid,
            serviceAccountToken,
        );

        await this.managedAgentClient.syncAgent(sessionConfig);
    }

    // --- Authorization ---

    private async assertCanViewProject(
        user: SessionUser,
        projectUuid: string,
    ): Promise<void> {
        const { organizationUuid } =
            await this.projectModel.getSummary(projectUuid);
        const auditedAbility = this.createAuditedAbility(user);
        if (
            auditedAbility.cannot(
                'view',
                subject('Project', { organizationUuid, projectUuid }),
            )
        ) {
            throw new ForbiddenError();
        }
    }

    private async assertCanManageProject(
        user: SessionUser,
        projectUuid: string,
    ): Promise<void> {
        const { organizationUuid } =
            await this.projectModel.getSummary(projectUuid);
        const auditedAbility = this.createAuditedAbility(user);
        if (
            auditedAbility.cannot(
                'update',
                subject('Project', { organizationUuid, projectUuid }),
            )
        ) {
            throw new ForbiddenError();
        }
    }

    // --- Settings API ---

    async getSettings(
        user: SessionUser,
        projectUuid: string,
    ): Promise<ManagedAgentSettings | null> {
        await this.assertCanViewProject(user, projectUuid);
        return this.managedAgentModel.getSettings(projectUuid);
    }

    async updateSettings(
        user: SessionUser,
        projectUuid: string,
        userUuid: string,
        update: UpdateManagedAgentSettings,
    ): Promise<ManagedAgentSettings> {
        await this.assertCanManageProject(user, projectUuid);
        const previous = await this.managedAgentModel.getSettings(projectUuid);
        const settings = await this.managedAgentModel.upsertSettings(
            projectUuid,
            userUuid,
            update,
        );

        // Create a service account for MCP auth if one doesn't exist yet.
        // Service accounts use Bearer auth which the MCP endpoint accepts.
        if (update.enabled) {
            const existingToken =
                await this.managedAgentModel.getServiceAccountToken(
                    projectUuid,
                );
            if (!existingToken) {
                const { organizationUuid } =
                    await this.projectModel.getSummary(projectUuid);
                const serviceAccount = await this.serviceAccountModel.create({
                    user,
                    data: {
                        organizationUuid,
                        description: `Autopilot (${projectUuid})`,
                        expiresAt: null,
                        scopes: [ServiceAccountScope.ORG_ADMIN],
                    },
                });
                await this.managedAgentModel.setServiceAccountToken(
                    projectUuid,
                    serviceAccount.token,
                );
                this.logger.info(
                    `Created service account for managed agent in project ${projectUuid}`,
                );
            }

            // Schedule the first heartbeat job
            const schedule =
                getManagedAgentScheduleCron(settings.schedule) ??
                this.lightdashConfig.managedAgent.schedule;
            await this.schedulerClient.scheduleManagedAgentHeartbeat(
                schedule,
                projectUuid,
            );
        } else if (update.enabled === false) {
            // Cancel pending heartbeat for this specific project
            await this.schedulerClient.cancelManagedAgentHeartbeat(projectUuid);
        }

        if (update.enabled || update.toolSettings !== undefined) {
            await this.syncProjectAgentConfig(projectUuid);
        }

        await this.trackSettingsChange(
            projectUuid,
            userUuid,
            previous,
            settings,
        );

        if (!previous?.enabled && settings.enabled) {
            void this.startHeartbeat(user, projectUuid, 'on_enable').catch(
                (error) => {
                    this.logger.error(
                        `Failed to trigger run-on-enable for project ${projectUuid}: ${
                            error instanceof Error ? error.message : 'Unknown'
                        }`,
                    );
                },
            );
        }

        return settings;
    }

    private async trackSettingsChange(
        projectUuid: string,
        userUuid: string,
        previous: ManagedAgentSettings | null,
        next: ManagedAgentSettings,
    ): Promise<void> {
        const { organizationUuid } =
            await this.projectModel.getSummary(projectUuid);
        const enabledTools = Object.entries(next.toolSettings)
            .filter(([, on]) => on)
            .map(([key]) => key);
        const disabledTools = Object.entries(next.toolSettings)
            .filter(([, on]) => !on)
            .map(([key]) => key);

        if (previous === null) {
            this.analytics.track({
                event: 'managed_agent.settings_created',
                userId: userUuid,
                properties: {
                    organizationId: organizationUuid,
                    projectId: projectUuid,
                    enabled: next.enabled,
                    schedule: next.schedule,
                    hasSlackChannel: next.slackChannelId !== null,
                    enabledTools,
                    disabledTools,
                },
            });
            return;
        }

        const changes: Array<
            'enabled' | 'disabled' | 'schedule' | 'slack_channel' | 'tools'
        > = [];
        if (previous.enabled !== next.enabled) {
            changes.push(next.enabled ? 'enabled' : 'disabled');
        }
        if (previous.schedule !== next.schedule) {
            changes.push('schedule');
        }
        if (previous.slackChannelId !== next.slackChannelId) {
            changes.push('slack_channel');
        }
        const toolKeys = new Set([
            ...Object.keys(previous.toolSettings),
            ...Object.keys(next.toolSettings),
        ]);
        const toolsChanged = [...toolKeys].some(
            (key) => previous.toolSettings[key] !== next.toolSettings[key],
        );
        if (toolsChanged) {
            changes.push('tools');
        }

        if (changes.length === 0) return;

        this.analytics.track({
            event: 'managed_agent.settings_updated',
            userId: userUuid,
            properties: {
                organizationId: organizationUuid,
                projectId: projectUuid,
                enabled: next.enabled,
                schedule: next.schedule,
                hasSlackChannel: next.slackChannelId !== null,
                enabledTools,
                disabledTools,
                changes,
                previousEnabled: previous.enabled,
                previousSchedule: previous.schedule,
            },
        });
    }

    async getEnabledProjects(): Promise<ManagedAgentSettings[]> {
        return this.managedAgentModel.getEnabledProjects();
    }

    // Worker-only entry point: creates the run row at the start of a
    // heartbeat. No permission check because the only caller is the scheduler
    // worker (system context, no SessionUser). User-facing triggers go
    // through `startHeartbeat` which performs `assertCanManageProject`
    // before enqueueing the worker job.
    async startRun(
        projectUuid: string,
        triggeredBy: ManagedAgentRunTriggeredBy,
    ): Promise<ManagedAgentRun> {
        return this.managedAgentModel.createRun({ projectUuid, triggeredBy });
    }

    async getLatestRun(
        user: SessionUser,
        projectUuid: string,
    ): Promise<ManagedAgentRun | null> {
        await this.assertCanViewProject(user, projectUuid);
        return this.managedAgentModel.getLatestRun(projectUuid);
    }

    async getRuns(
        user: SessionUser,
        projectUuid: string,
        opts: { limit: number; cursor: string | null },
    ): Promise<ManagedAgentRunsListResponse> {
        await this.assertCanViewProject(user, projectUuid);
        const decodedCursor = decodeRunsCursor(opts.cursor);
        const { runs, nextCursor } = await this.managedAgentModel.getRuns(
            projectUuid,
            { limit: opts.limit, cursor: decodedCursor },
        );
        return { runs, nextCursor: encodeRunsCursor(nextCursor) };
    }

    async isAiAutopilotEnabledForProject(
        settings: ManagedAgentSettings,
    ): Promise<boolean> {
        const project = await this.projectModel.getSummary(
            settings.projectUuid,
        );
        const user = settings.enabledByUserUuid
            ? await this.userModel.findSessionUserAndOrgByUuid(
                  settings.enabledByUserUuid,
                  project.organizationUuid,
              )
            : undefined;
        const featureFlag = await this.featureFlagModel.get({
            user,
            featureFlagId: FeatureFlags.AiAutopilot,
        });

        return featureFlag.enabled;
    }

    // --- Actions API ---

    async getActions(
        user: SessionUser,
        projectUuid: string,
        filters: ManagedAgentActionFilters = {},
    ): Promise<ManagedAgentAction[]> {
        await this.assertCanViewProject(user, projectUuid);
        return this.managedAgentModel.getActions(projectUuid, filters);
    }

    async reverseAction(
        user: SessionUser,
        projectUuid: string,
        actionUuid: string,
        userUuid: string,
    ): Promise<ManagedAgentAction> {
        await this.assertCanManageProject(user, projectUuid);
        const action = await this.managedAgentModel.getAction(actionUuid);
        if (!action) {
            throw new NotFoundError(`Action ${actionUuid} not found`);
        }
        if (action.projectUuid !== projectUuid) {
            throw new ForbiddenError(
                `Action ${actionUuid} does not belong to project ${projectUuid}`,
            );
        }
        if (action.reversedAt) {
            throw new Error(`Action ${actionUuid} already reversed`);
        }

        // Perform the actual reversal based on action type
        switch (action.actionType) {
            case ManagedAgentActionType.SOFT_DELETED:
                // Restore the soft-deleted content
                if (action.targetType === ManagedAgentTargetType.CHART) {
                    await this.savedChartModel.restore(action.targetUuid);
                } else if (
                    action.targetType === ManagedAgentTargetType.DASHBOARD
                ) {
                    await this.dashboardModel.restore(action.targetUuid);
                }
                break;
            case ManagedAgentActionType.CREATED_CONTENT:
                // Soft-delete the agent-created content (still recoverable)
                if (action.targetType === ManagedAgentTargetType.CHART) {
                    await this.savedChartModel.softDelete(
                        action.targetUuid,
                        userUuid,
                    );
                }
                break;
            case ManagedAgentActionType.FIXED_BROKEN:
                await this.restorePreviousChartVersion(action);
                break;
            case ManagedAgentActionType.FLAGGED_STALE:
            case ManagedAgentActionType.FLAGGED_BROKEN:
            case ManagedAgentActionType.FLAGGED_SLOW:
            case ManagedAgentActionType.INSIGHT:
                // Log-only entries — marking as reversed dismisses them
                break;
            default:
                break;
        }

        const reversed = await this.managedAgentModel.reverseAction(
            actionUuid,
            userUuid,
        );

        const { organizationUuid } =
            await this.projectModel.getSummary(projectUuid);
        this.analytics.track({
            event: 'managed_agent.action_reversed',
            userId: userUuid,
            properties: {
                organizationId: organizationUuid,
                projectId: projectUuid,
                actionType: action.actionType,
                actionCategory: getManagedAgentActionCategory(
                    action.actionType,
                ),
                targetType: action.targetType,
                sessionId: action.sessionId,
                actionAgeMs: Date.now() - new Date(action.createdAt).getTime(),
            },
        });

        return reversed;
    }

    private async restorePreviousChartVersion(
        action: ManagedAgentAction,
    ): Promise<void> {
        if (action.targetType !== ManagedAgentTargetType.CHART) {
            return;
        }
        const metadata = getFixedBrokenMetadata(action.metadata);
        if (!metadata) {
            throw new ParameterError(
                'This fix was recorded before revert support — restore manually via the chart version history.',
            );
        }
        const previousChart = await this.savedChartModel.get(
            action.targetUuid,
            metadata.previousVersionUuid,
        );
        await this.savedChartModel.createVersion(
            action.targetUuid,
            previousChart,
            undefined, // user — version creation doesn't require one
        );
    }

    // --- Heartbeat ---

    async runHeartbeat(projectUuid: string, runUuid: string): Promise<void> {
        const settings = await this.managedAgentModel.getSettings(projectUuid);
        if (!settings?.enabled) {
            await this.failRunSafely(runUuid, 'Autopilot disabled');
            return;
        }

        // Get the auto-created PAT for MCP auth
        const serviceAccountToken =
            await this.managedAgentModel.getServiceAccountToken(projectUuid);
        if (!serviceAccountToken) {
            this.logger.warn(
                `No service account token for project ${projectUuid}, skipping heartbeat`,
            );
            await this.failRunSafely(runUuid, 'No service account token');
            return;
        }

        this.logger.info(`Running heartbeat for project: ${projectUuid}`);

        const sessionConfig = await this.getSessionConfig(
            projectUuid,
            serviceAccountToken,
        );
        let sessionId = '';
        let agentSummary = '';
        let runError: string | null = null;

        const onToolCall = async (
            toolName: string,
            input: Record<string, unknown>,
        ): Promise<string> =>
            this.handleToolCall(
                projectUuid,
                sessionId,
                runUuid,
                toolName,
                input,
            );

        const onSessionCreated = (id: string) => {
            sessionId = id;
            void this.managedAgentModel
                .setRunSessionId(runUuid, id)
                .catch((e) =>
                    this.logger.error(
                        `Failed to set session_id on run ${runUuid}: ${
                            e instanceof Error ? e.message : 'Unknown'
                        }`,
                    ),
                );
        };

        try {
            const result = await this.managedAgentClient.runSession(
                sessionConfig,
                projectUuid,
                onToolCall,
                onSessionCreated,
            );
            sessionId = result.sessionId;
            agentSummary = result.summary;
            this.logger.info(`Heartbeat complete for project: ${projectUuid}`);
        } catch (error) {
            this.logger.error(
                `Heartbeat session error for project ${projectUuid}: ${error instanceof Error ? error.message : 'Unknown'}`,
            );
            runError = error instanceof Error ? error.message : 'Unknown';
        } finally {
            const actionCount = await this.managedAgentModel
                .countActionsForRun(runUuid)
                .catch(() => 0);
            await this.managedAgentModel
                .finishRun(runUuid, {
                    status: runError
                        ? ManagedAgentRunStatus.ERROR
                        : ManagedAgentRunStatus.COMPLETED,
                    actionCount,
                    summary: agentSummary || null,
                    error: runError,
                })
                .catch((e) =>
                    this.logger.error(
                        `Failed to finish run ${runUuid}: ${
                            e instanceof Error ? e.message : 'Unknown'
                        }`,
                    ),
                );

            // Post summary to Slack even if the session errored — actions
            // recorded via custom tools before the crash are still valuable.
            this.logger.info(
                `Slack notification check: slackChannelId=${settings.slackChannelId ?? 'null'}, sessionId=${sessionId || 'empty'}`,
            );
            if (settings.slackChannelId && sessionId) {
                await this.postHeartbeatSummaryToSlack(
                    projectUuid,
                    sessionId,
                    settings.slackChannelId,
                    agentSummary,
                );
            }
        }
    }

    private async failRunSafely(runUuid: string, error: string): Promise<void> {
        await this.managedAgentModel
            .finishRun(runUuid, {
                status: ManagedAgentRunStatus.ERROR,
                actionCount: 0,
                summary: null,
                error,
            })
            .catch((e) =>
                this.logger.error(
                    `Failed to fail run ${runUuid}: ${
                        e instanceof Error ? e.message : 'Unknown'
                    }`,
                ),
            );
    }

    async startHeartbeat(
        user: SessionUser,
        projectUuid: string,
        triggeredBy: 'manual' | 'on_enable' = 'manual',
    ): Promise<void> {
        await this.assertCanManageProject(user, projectUuid);

        const settings = await this.managedAgentModel.getSettings(projectUuid);
        if (settings) {
            const { organizationUuid } =
                await this.projectModel.getSummary(projectUuid);
            this.analytics.track({
                event: 'managed_agent.run_now_triggered',
                userId: user.userUuid,
                properties: {
                    organizationId: organizationUuid,
                    projectId: projectUuid,
                    schedule: settings.schedule,
                    triggeredBy,
                },
            });
        }

        await this.schedulerClient.triggerManagedAgentHeartbeat(
            projectUuid,
            triggeredBy,
        );
    }

    private async postHeartbeatSummaryToSlack(
        projectUuid: string,
        sessionId: string,
        slackChannelId: string,
        agentSummary: string,
    ): Promise<void> {
        this.logger.info(
            `Posting Slack summary: project=${projectUuid}, session=${sessionId}, channel=${slackChannelId}, summaryLength=${agentSummary.length}`,
        );
        try {
            const actions = await this.managedAgentModel.getActions(
                projectUuid,
                { sessionId },
            );

            this.logger.info(
                `Found ${actions.length} actions for session ${sessionId}`,
            );

            if (actions.length === 0 && !agentSummary) {
                this.logger.info(
                    'No actions or summary to report, skipping Slack',
                );
                return;
            }

            const { organizationUuid } =
                await this.projectModel.getSummary(projectUuid);
            const { siteUrl } = this.lightdashConfig;
            const activityUrl = `${siteUrl}/projects/${projectUuid}/autopilot`;

            // Build compact action counts
            const counts: Record<string, number> = {};
            for (const a of actions) {
                counts[a.actionType] = (counts[a.actionType] || 0) + 1;
            }

            const summaryParts: string[] = [];
            if (counts.fixed_broken)
                summaryParts.push(`*${counts.fixed_broken}* fixed`);
            if (counts.created_content)
                summaryParts.push(`*${counts.created_content}* created`);
            if (counts.flagged_stale)
                summaryParts.push(`*${counts.flagged_stale}* flagged stale`);
            if (counts.flagged_broken)
                summaryParts.push(`*${counts.flagged_broken}* flagged broken`);
            if (counts.soft_deleted)
                summaryParts.push(`*${counts.soft_deleted}* deleted`);
            if (counts.insight)
                summaryParts.push(
                    `*${counts.insight}* insight${counts.insight > 1 ? 's' : ''}`,
                );

            // Convert agent's markdown summary to Slack mrkdwn
            // Main message: compact summary with CTA
            const mainBlocks: KnownBlock[] = [
                {
                    type: 'section',
                    text: {
                        type: 'mrkdwn',
                        text: `:zap: *Autopilot completed a health check*\n${summaryParts.length > 0 ? summaryParts.join('  ·  ') : '_No actions this run_'}`,
                    },
                    accessory: {
                        type: 'button',
                        text: {
                            type: 'plain_text',
                            text: 'View activity',
                            emoji: true,
                        },
                        url: activityUrl,
                    },
                },
            ];

            const mainMessage = await this.slackClient.postMessage({
                organizationUuid,
                channel: slackChannelId,
                text: `Autopilot: ${summaryParts.join(', ') || 'health check complete'}`,
                blocks: mainBlocks,
            });

            // Thread reply: full detailed report
            if (agentSummary && mainMessage?.ts) {
                const slackSummary = agentSummary
                    .replace(/^#{1,3}\s+(.+)$/gm, '*$1*')
                    .replace(/\*{2}([^*]+)\*{2}/g, '*$1*')
                    .replace(/\|---[|\-\s]*\|/g, '');

                // Split into chunks of 2800 chars to stay under Slack's 3000 limit
                const chunks: string[] = [];
                let remaining = slackSummary;
                while (remaining.length > 0) {
                    chunks.push(remaining.slice(0, 2800));
                    remaining = remaining.slice(2800);
                }

                for (const chunk of chunks) {
                    // eslint-disable-next-line no-await-in-loop
                    await this.slackClient.postMessage({
                        organizationUuid,
                        channel: slackChannelId,
                        thread_ts: mainMessage.ts,
                        text: chunk,
                        blocks: [
                            {
                                type: 'section',
                                text: {
                                    type: 'mrkdwn',
                                    text: chunk,
                                },
                            },
                        ],
                    });
                }
            }

            this.logger.info(
                `Posted heartbeat summary to Slack channel ${slackChannelId}`,
            );
        } catch (error) {
            this.logger.warn(
                `Failed to post heartbeat summary to Slack: ${error instanceof Error ? error.message : 'Unknown error'}`,
            );
        }
    }

    // --- Tool Handlers ---

    private async handleToolCall(
        projectUuid: string,
        sessionId: string,
        runUuid: string,
        toolName: string,
        input: Record<string, unknown>,
    ): Promise<string> {
        void this.managedAgentModel
            .setCurrentActivity(runUuid, friendlyToolLabel(toolName))
            .catch((e) =>
                this.logger.warn(
                    `Failed to update current_activity for run ${runUuid}: ${
                        e instanceof Error ? e.message : 'Unknown'
                    }`,
                ),
            );
        switch (toolName) {
            case 'get_recent_actions':
                return this.handleGetRecentActions(
                    projectUuid,
                    input.limit as number | undefined,
                );
            case 'get_stale_charts':
                return this.handleGetStaleContent(projectUuid, 'charts');
            case 'get_stale_dashboards':
                return this.handleGetStaleContent(projectUuid, 'dashboards');
            case 'get_broken_content':
                return this.handleGetBrokenContent(projectUuid);
            case 'get_preview_projects':
                return this.handleGetPreviewProjects(projectUuid);
            case 'get_popular_content':
                return this.handleGetPopularContent(projectUuid);
            case 'flag_content':
                return this.handleFlagContent(
                    projectUuid,
                    sessionId,
                    runUuid,
                    input,
                );
            case 'soft_delete_content':
                return this.handleSoftDelete(
                    projectUuid,
                    sessionId,
                    runUuid,
                    input,
                );
            case 'log_insight':
                return this.handleLogInsight(
                    projectUuid,
                    sessionId,
                    runUuid,
                    input,
                );
            case 'get_chart_details':
                return this.handleGetChartDetails(projectUuid, input);
            case 'get_chart_schema':
                return this.handleGetChartSchema();
            case 'fix_broken_chart':
                return this.handleFixBrokenChart(
                    projectUuid,
                    sessionId,
                    runUuid,
                    input,
                );
            case 'create_content_from_code':
                return this.handleCreateContent(
                    projectUuid,
                    sessionId,
                    runUuid,
                    input,
                );
            case 'get_user_questions':
                return this.handleGetUserQuestions(projectUuid, input);
            case 'get_slow_queries':
                return this.handleGetSlowQueries(projectUuid, input);
            case 'reverse_own_action':
                return this.handleReverseOwnAction(projectUuid, input);
            default:
                return JSON.stringify({ error: `Unknown tool: ${toolName}` });
        }
    }

    private async handleGetRecentActions(
        projectUuid: string,
        limit?: number,
    ): Promise<string> {
        const actions = await this.managedAgentModel.getRecentActions(
            projectUuid,
            limit ?? 50,
        );
        return JSON.stringify(
            actions.map((a) => ({
                action_uuid: a.actionUuid,
                action_type: a.actionType,
                target_name: a.targetName,
                target_type: a.targetType,
                description: a.description,
                reversed: a.reversedAt !== null,
                created_at: a.createdAt.toISOString(),
            })),
        );
    }

    private async handleGetStaleContent(
        projectUuid: string,
        type: 'charts' | 'dashboards',
    ): Promise<string> {
        const unused = await this.analyticsModel.getUnusedContent(projectUuid);
        const items = type === 'charts' ? unused.charts : unused.dashboards;
        return JSON.stringify(
            items.map((item) => ({
                uuid: item.contentUuid,
                name: item.contentName,
                type: item.contentType,
                last_viewed_at: item.lastViewedAt?.toISOString() ?? null,
                views_count: item.viewsCount,
                created_by: item.createdByUserName,
                created_at: item.createdAt.toISOString(),
            })),
        );
    }

    private async handleGetBrokenContent(projectUuid: string): Promise<string> {
        const validations: ValidationResponse[] =
            await this.validationModel.get(projectUuid);
        return JSON.stringify(
            validations.map((v) => ({
                uuid: (() => {
                    if ('chartUuid' in v) return v.chartUuid;
                    if ('dashboardUuid' in v) return v.dashboardUuid;
                    return null;
                })(),
                name: v.name ?? 'Unknown',
                type: 'chartUuid' in v ? 'chart' : 'dashboard',
                error: v.error,
                error_type: v.errorType,
                source: v.source,
            })),
        );
    }

    private async handleGetPreviewProjects(
        projectUuid: string,
    ): Promise<string> {
        const project = await this.projectModel.get(projectUuid);
        // Only return preview projects that were copied from THIS project,
        // not all preview projects across the organization.
        const allProjects = await this.projectModel.getAllByOrganizationUuid(
            project.organizationUuid,
        );
        const threeMonthsAgo = new Date();
        threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

        const oldPreviews = allProjects.filter(
            (p) =>
                p.type === ProjectType.PREVIEW &&
                p.upstreamProjectUuid === projectUuid &&
                new Date(p.createdAt) < threeMonthsAgo,
        );

        return JSON.stringify(
            oldPreviews.map((p) => ({
                uuid: p.projectUuid,
                name: p.name,
                created_at: p.createdAt,
            })),
        );
    }

    private async handleGetPopularContent(
        projectUuid: string,
    ): Promise<string> {
        const spaces = await this.spaceModel.find({ projectUuid });
        const spaceUuids = spaces.map((space) => space.uuid);
        const [popularCharts, popularDashboards] = await Promise.all([
            this.spaceModel.getSpaceQueries(spaceUuids, {
                mostPopular: true,
            }),
            this.spaceModel.getSpaceDashboards(spaceUuids, {
                mostPopular: true,
            }),
        ]);

        const allItems = [
            ...popularCharts.map((item) => ({
                uuid: item.uuid,
                name: item.name,
                type: 'chart' as const,
                views_count: item.views,
                created_by: item.updatedByUser
                    ? `${item.updatedByUser.firstName} ${item.updatedByUser.lastName}`.trim()
                    : '',
            })),
            ...popularDashboards.map((item) => ({
                uuid: item.uuid,
                name: item.name,
                type: 'dashboard' as const,
                views_count: item.views,
                created_by: item.updatedByUser
                    ? `${item.updatedByUser.firstName} ${item.updatedByUser.lastName}`.trim()
                    : '',
            })),
        ]
            .sort((a, b) => b.views_count - a.views_count)
            .slice(0, this.spaceModel.MOST_POPULAR_OR_RECENTLY_UPDATED_LIMIT);

        const chartUuids = allItems
            .filter((item) => item.type === 'chart')
            .map((item) => item.uuid);
        const dashboardUuids = allItems
            .filter((item) => item.type === 'dashboard')
            .map((item) => item.uuid);

        const [chartViews, dashboardViews] = await Promise.all([
            this.analyticsModel.getLastViewedAtForCharts(chartUuids),
            this.analyticsModel.getLastViewedAtForDashboards(dashboardUuids),
        ]);

        return JSON.stringify(
            allItems.map((item) => ({
                uuid: item.uuid,
                name: item.name,
                type: item.type,
                views_count: item.views_count,
                last_viewed_at:
                    (item.type === 'chart'
                        ? chartViews.get(item.uuid)
                        : dashboardViews.get(item.uuid)
                    )?.toISOString?.() ?? null,
                created_by: item.created_by,
            })),
        );
    }

    // eslint-disable-next-line class-methods-use-this
    private async handleGetChartSchema(): Promise<string> {
        // Return the chart-as-code YAML structure from the developing-in-lightdash skill
        return `Chart-as-code YAML/JSON reference. Use this when calling create_content_from_code.

## Base Structure (all charts)

chartConfig:
  config: {}        # Type-specific config
  type: <type>      # MUST be: cartesian, table, big_number, pie, funnel, gauge, treemap, map
contentType: chart
metricQuery:
  dimensions:
    - explore_name_dimension_name    # Field IDs from find_fields
  exploreName: explore_name
  filters: {}
  limit: 500
  metrics:
    - explore_name_metric_name       # Field IDs from find_fields
  sorts:
    - fieldId: explore_name_metric_name
      descending: true
  tableCalculations: []
name: "Chart Name"
slug: unique-chart-slug              # URL-friendly, prefix with "agent-"
spaceSlug: agent-suggestions
tableConfig:
  columnOrder: []
tableName: explore_name              # Same as exploreName
version: 1

## Chart Type Guide

| Data Pattern | Chart Type | chartConfig.type |
|--------------|-----------|-----------------|
| Trends over time | Line/area | cartesian |
| Category comparisons | Bar | cartesian |
| Part-of-whole | Proportions | pie |
| Single KPI | Big number | big_number |
| Detailed records | Data table | table |

## CRITICAL Rules
- chartConfig.type MUST be "cartesian" for line, bar, area, scatter charts. NEVER use "line" or "bar".
- Every dimension in metricQuery.dimensions must be used in the chart (layout xField, yField, or group).
- Field IDs use the format: explorename_fieldname (get exact IDs from find_fields MCP tool).
- tableName and exploreName must match a real explore (get from list_explores MCP tool).
- Always validate data with run_metric_query before creating.
- Prefix slug with "agent-" to identify agent-created content.

## Cartesian Config Example (bar chart)
chartConfig:
  type: cartesian
  config:
    layout:
      xField: orders_status
      yField:
        - orders_total_order_amount
    eChartsConfig: {}

## Big Number Config Example
chartConfig:
  type: big_number
  config:
    label: "Total Revenue"
`;
    }

    private async handleGetChartDetails(
        projectUuid: string,
        input: Record<string, unknown>,
    ): Promise<string> {
        const chartUuid = input.chart_uuid as string;
        if (!chartUuid) {
            throw new Error('chart_uuid is required');
        }
        const chart = await this.savedChartModel.get(chartUuid);
        ManagedAgentService.assertProjectOwnership(
            chart.projectUuid,
            projectUuid,
            'Chart',
            chartUuid,
        );
        return JSON.stringify({
            uuid: chart.uuid,
            name: chart.name,
            tableName: chart.tableName,
            metricQuery: chart.metricQuery,
            chartConfig: chart.chartConfig,
            tableConfig: chart.tableConfig,
            pivotConfig: chart.pivotConfig,
        });
    }

    private async handleFixBrokenChart(
        projectUuid: string,
        sessionId: string,
        runUuid: string,
        input: Record<string, unknown>,
    ): Promise<string> {
        const chartUuid = input.chart_uuid as string;
        const chartName = input.chart_name as string;
        const description = input.description as string;
        if (!chartUuid || !chartName || !description) {
            throw new Error(
                'chart_uuid, chart_name, and description are required',
            );
        }

        // Validate the chart payload before writing
        ManagedAgentService.validateChartPayload(
            input.metric_query,
            input.chart_config,
        );

        // Get the current chart and verify it belongs to this project
        const chart = await this.savedChartModel.get(chartUuid);
        ManagedAgentService.assertProjectOwnership(
            chart.projectUuid,
            projectUuid,
            'Chart',
            chartUuid,
        );

        const previousVersion =
            await this.savedChartModel.getLatestVersionSummary(chartUuid);
        if (!previousVersion) {
            throw new Error(
                `Cannot fix chart ${chartUuid}: no existing version found`,
            );
        }
        const previousVersionUuid = previousVersion.versionUuid;

        // Create a new version with the fixed config
        await this.savedChartModel.createVersion(
            chartUuid,
            {
                tableName: chart.tableName,
                metricQuery: input.metric_query as MetricQuery,
                chartConfig: input.chart_config as ChartConfig,
                tableConfig: input.table_config
                    ? (input.table_config as { columnOrder: string[] })
                    : chart.tableConfig,
                pivotConfig: chart.pivotConfig,
                parameters: chart.parameters,
            },
            undefined, // user — not needed for version creation
        );

        // Clear stale validation errors for this chart — the fix should resolve them.
        // If the fix was incomplete, the next validateProject run will re-create them.
        await this.validationModel.deleteChartValidations(chartUuid);

        const action = await this.managedAgentModel.createAction({
            projectUuid,
            sessionId,
            managedAgentRunUuid: runUuid,
            actionType: ManagedAgentActionType.FIXED_BROKEN,
            targetType: ManagedAgentTargetType.CHART,
            targetUuid: chartUuid,
            targetName: chartName,
            description,
            metadata: { previousVersionUuid },
        });

        return JSON.stringify({
            action_uuid: action.actionUuid,
            fixed: true,
        });
    }

    private async getOrCreateAgentSpace(projectUuid: string): Promise<string> {
        // Find existing "Agent Suggestions" space
        const spaces = await this.spaceModel.find({
            projectUuid,
            slug: 'agent-suggestions',
        });
        if (spaces.length > 0) {
            return spaces[0].uuid;
        }

        // Get the user who enabled the agent to use as the space creator
        const settings = await this.managedAgentModel.getSettings(projectUuid);
        const enabledByUserUuid = settings?.enabledByUserUuid;
        if (!enabledByUserUuid) {
            throw new Error(
                'Cannot create Agent Suggestions space: no user has enabled the agent for this project',
            );
        }

        const user =
            await this.userModel.getUserDetailsByUuid(enabledByUserUuid);
        const { userId } = user;

        const space = await this.spaceModel.createSpace(
            {
                name: 'Agent Suggestions',
                inheritParentPermissions: true,
                parentSpaceUuid: null,
            },
            { projectUuid, userId },
        );
        return space.uuid;
    }

    private async handleCreateContent(
        projectUuid: string,
        sessionId: string,
        runUuid: string,
        input: Record<string, unknown>,
    ): Promise<string> {
        const chartAsCode = input.chart_as_code as Record<string, unknown>;
        if (!chartAsCode || typeof chartAsCode !== 'object') {
            throw new Error('chart_as_code must be a non-null object');
        }
        const description = input.description as string;
        if (!description) {
            throw new Error('description is required');
        }
        const chartName = (chartAsCode.name as string) ?? 'Untitled';

        // Normalize chart type — agent may send "line", "bar", "area" but
        // Lightdash uses "cartesian" for all of those
        const chartConfig = chartAsCode.chartConfig as Record<string, unknown>;
        if (chartConfig) {
            const chartType = (chartConfig.type as string) ?? '';
            if (
                [
                    'line',
                    'bar',
                    'area',
                    'vertical_bar',
                    'horizontal_bar',
                    'scatter',
                ].includes(chartType)
            ) {
                chartConfig.type = 'cartesian';
            }
        }

        // Validate the chart payload structure
        ManagedAgentService.validateChartPayload(
            chartAsCode.metricQuery,
            chartConfig ?? chartAsCode.chartConfig,
            chartAsCode.tableName,
        );

        // Validate fields exist in the explore
        const tableName = chartAsCode.tableName as string;
        const mq = chartAsCode.metricQuery as Record<string, unknown>;
        const dimensions = mq.dimensions as string[];
        const metrics = mq.metrics as string[];

        const explores = await this.projectModel.findExploresFromCache(
            projectUuid,
            'name',
            [tableName],
        );
        const explore = explores[tableName];
        if (!explore || 'errors' in explore) {
            throw new Error(
                `Explore "${tableName}" not found or has errors. Use list_explores MCP tool to find valid explore names.`,
            );
        }

        // Collect all valid field IDs from the explore.
        // Field IDs use the format: tableName_fieldName (see getItemId in common/utils/item.ts)
        const allFields = new Set<string>();
        for (const [tblName, table] of Object.entries(explore.tables)) {
            for (const dimName of Object.keys(table.dimensions)) {
                allFields.add(`${tblName}_${dimName}`);
            }
            for (const metricName of Object.keys(table.metrics)) {
                allFields.add(`${tblName}_${metricName}`);
            }
        }

        const invalidDimensions = dimensions.filter((d) => !allFields.has(d));
        const invalidMetrics = metrics.filter((m) => !allFields.has(m));

        if (invalidDimensions.length > 0 || invalidMetrics.length > 0) {
            const errors: string[] = [];
            if (invalidDimensions.length > 0) {
                errors.push(
                    `Invalid dimensions: ${invalidDimensions.join(', ')}`,
                );
            }
            if (invalidMetrics.length > 0) {
                errors.push(`Invalid metrics: ${invalidMetrics.join(', ')}`);
            }
            throw new Error(
                `${errors.join('. ')}. Use find_fields MCP tool to discover valid field IDs for the "${tableName}" explore.`,
            );
        }

        // Get or create the Agent Suggestions space
        const spaceUuid = await this.getOrCreateAgentSpace(projectUuid);

        // Use the user who enabled the agent
        const settings = await this.managedAgentModel.getSettings(projectUuid);
        const userUuid = settings?.enabledByUserUuid;
        if (!userUuid) {
            throw new Error(
                'Cannot create content: no user has enabled the agent for this project',
            );
        }

        // Create the chart directly via the model
        const chart = await this.savedChartModel.create(projectUuid, userUuid, {
            name: chartName,
            description: description ?? null,
            tableName: chartAsCode.tableName as string,
            metricQuery: chartAsCode.metricQuery as MetricQuery,
            chartConfig: (chartConfig ??
                chartAsCode.chartConfig) as ChartConfig,
            tableConfig: (chartAsCode.tableConfig as {
                columnOrder: string[];
            }) ?? {
                columnOrder: [],
            },
            pivotConfig:
                (chartAsCode.pivotConfig as SavedChart['pivotConfig']) ??
                undefined,
            spaceUuid,
            updatedByUser: {
                userUuid,
                firstName: 'AI',
                lastName: 'Agent',
            },
            slug: (chartAsCode.slug as string) ?? `agent-${Date.now()}`,
        });

        const action = await this.managedAgentModel.createAction({
            projectUuid,
            sessionId,
            managedAgentRunUuid: runUuid,
            actionType: ManagedAgentActionType.CREATED_CONTENT,
            targetType: ManagedAgentTargetType.CHART,
            targetUuid: chart.uuid,
            targetName: chartName,
            description,
            metadata: { chart_as_code: chartAsCode },
        });

        return JSON.stringify({
            action_uuid: action.actionUuid,
            chart_uuid: chart.uuid,
            chart_name: chartName,
        });
    }

    private static readonly VALID_FLAG_TYPES = new Set<string>([
        ManagedAgentActionType.FLAGGED_STALE,
        ManagedAgentActionType.FLAGGED_BROKEN,
        ManagedAgentActionType.FLAGGED_SLOW,
    ]);

    private async handleFlagContent(
        projectUuid: string,
        sessionId: string,
        runUuid: string,
        input: Record<string, unknown>,
    ): Promise<string> {
        const targetUuid = input.target_uuid as string;
        const targetName = input.target_name as string;
        const description = input.description as string;
        if (!targetUuid || !targetName || !description) {
            throw new Error(
                'target_uuid, target_name, and description are required',
            );
        }

        const flagType = input.flag_type as string;
        if (!ManagedAgentService.VALID_FLAG_TYPES.has(flagType)) {
            throw new Error(
                `Invalid flag_type: "${flagType}". Must be one of: ${[...ManagedAgentService.VALID_FLAG_TYPES].join(', ')}`,
            );
        }

        const targetType = ManagedAgentService.validateEnum(
            input.target_type,
            ManagedAgentTargetType,
            'target_type',
        );

        // Block flagging agent-created charts as stale
        if (
            flagType === ManagedAgentActionType.FLAGGED_STALE &&
            targetType === ManagedAgentTargetType.CHART
        ) {
            try {
                const chart = await this.savedChartModel.get(targetUuid);
                if (chart.slug?.startsWith('agent-')) {
                    return JSON.stringify({
                        error: `Chart "${targetName}" was created by the agent (slug: ${chart.slug}). Cannot flag own content as stale.`,
                        blocked: true,
                    });
                }
            } catch {
                // Chart may not exist (already deleted) — allow flagging
            }
        }

        const action = await this.managedAgentModel.createAction({
            projectUuid,
            sessionId,
            managedAgentRunUuid: runUuid,
            actionType: flagType as ManagedAgentActionType,
            targetType,
            targetUuid,
            targetName,
            description,
            metadata: (input.metadata as Record<string, unknown>) ?? {},
        });
        return JSON.stringify({ action_uuid: action.actionUuid });
    }

    private async handleSoftDelete(
        projectUuid: string,
        sessionId: string,
        runUuid: string,
        input: Record<string, unknown>,
    ): Promise<string> {
        const targetUuid = input.target_uuid as string;
        const targetName = input.target_name as string;
        const description = input.description as string;
        if (!targetUuid || !targetName || !description) {
            throw new Error(
                'target_uuid, target_name, and description are required',
            );
        }

        const targetType = ManagedAgentService.validateEnum(
            input.target_type,
            ManagedAgentTargetType,
            'target_type',
        );

        // Use the admin who enabled the agent as the actor
        const settings = await this.managedAgentModel.getSettings(projectUuid);
        const actorUuid = settings?.enabledByUserUuid ?? projectUuid;

        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        // Verify entity exists, belongs to this project, and apply guardrails
        if (targetType === ManagedAgentTargetType.CHART) {
            const chart = await this.savedChartModel.get(targetUuid);
            ManagedAgentService.assertProjectOwnership(
                chart.projectUuid,
                projectUuid,
                'Chart',
                targetUuid,
            );
            // Hard guardrail: never delete agent-created charts
            if (chart.slug?.startsWith('agent-')) {
                return JSON.stringify({
                    error: `Chart "${targetName}" was created by the agent (slug: ${chart.slug}). Cannot soft-delete own content.`,
                    blocked: true,
                });
            }
            // Hard guardrail: never delete charts created in the last 30 days
            const chartCreatedAt =
                await this.managedAgentModel.getChartCreatedAt(targetUuid);
            if (chartCreatedAt && chartCreatedAt > thirtyDaysAgo) {
                return JSON.stringify({
                    error: `Chart "${targetName}" was created on ${chartCreatedAt.toISOString().split('T')[0]}, less than 30 days ago. Cannot soft-delete recent content.`,
                    blocked: true,
                });
            }
            await this.savedChartModel.softDelete(targetUuid, actorUuid);
        } else if (targetType === ManagedAgentTargetType.DASHBOARD) {
            const dashboard =
                await this.dashboardModel.getByIdOrSlug(targetUuid);
            ManagedAgentService.assertProjectOwnership(
                dashboard.projectUuid,
                projectUuid,
                'Dashboard',
                targetUuid,
            );
            // Hard guardrail: never delete dashboards created in the last 30 days
            const dashCreatedAt =
                await this.managedAgentModel.getDashboardCreatedAt(targetUuid);
            if (dashCreatedAt && dashCreatedAt > thirtyDaysAgo) {
                return JSON.stringify({
                    error: `Dashboard "${targetName}" was created on ${dashCreatedAt.toISOString().split('T')[0]}, less than 30 days ago. Cannot soft-delete recent content.`,
                    blocked: true,
                });
            }
            await this.dashboardModel.softDelete(targetUuid, actorUuid);
        } else {
            throw new Error(
                `soft_delete_content only supports chart and dashboard, got: ${targetType}`,
            );
        }

        const action = await this.managedAgentModel.createAction({
            projectUuid,
            sessionId,
            managedAgentRunUuid: runUuid,
            actionType: ManagedAgentActionType.SOFT_DELETED,
            targetType,
            targetUuid,
            targetName,
            description,
            metadata: (input.metadata as Record<string, unknown>) ?? {},
        });
        return JSON.stringify({
            action_uuid: action.actionUuid,
            recoverable: true,
        });
    }

    private async handleLogInsight(
        projectUuid: string,
        sessionId: string,
        runUuid: string,
        input: Record<string, unknown>,
    ): Promise<string> {
        const targetUuid = input.target_uuid as string;
        const targetName = input.target_name as string;
        const description = input.description as string;
        if (!targetUuid || !targetName || !description) {
            throw new Error(
                'target_uuid, target_name, and description are required',
            );
        }

        const targetType = ManagedAgentService.validateEnum(
            input.target_type,
            ManagedAgentTargetType,
            'target_type',
        );

        const action = await this.managedAgentModel.createAction({
            projectUuid,
            sessionId,
            managedAgentRunUuid: runUuid,
            actionType: ManagedAgentActionType.INSIGHT,
            targetType,
            targetUuid,
            targetName,
            description,
            metadata: (input.metadata as Record<string, unknown>) ?? {},
        });
        return JSON.stringify({ action_uuid: action.actionUuid });
    }

    private async handleGetUserQuestions(
        projectUuid: string,
        input: Record<string, unknown>,
    ): Promise<string> {
        const limit = (input.limit as number) ?? 30;
        const days = (input.days as number) ?? 30;

        const questions = await this.managedAgentModel.getUserQuestions(
            projectUuid,
            days,
            limit,
        );

        return JSON.stringify(
            questions.map((q) => ({
                question: q.prompt,
                asked_by: q.userName,
                asked_at: q.createdAt,
            })),
        );
    }

    private async handleGetSlowQueries(
        projectUuid: string,
        input: Record<string, unknown>,
    ): Promise<string> {
        const thresholdMs = (input.threshold_ms as number) ?? 2000;
        const limit = (input.limit as number) ?? 20;

        const slowQueries = await this.managedAgentModel.getSlowQueries(
            projectUuid,
            thresholdMs,
            limit,
        );

        return JSON.stringify(
            slowQueries.map((q) => ({
                execution_time_ms: q.executionTimeMs,
                execution_time_seconds: (q.executionTimeMs / 1000).toFixed(1),
                context: q.context,
                chart_uuid: q.chartUuid,
                chart_name: q.chartName,
                dashboard_uuid: q.dashboardUuid,
                dashboard_name: q.dashboardName,
                ran_at: q.createdAt,
            })),
        );
    }

    private async handleReverseOwnAction(
        projectUuid: string,
        input: Record<string, unknown>,
    ): Promise<string> {
        const actionUuid = input.action_uuid as string;
        const reason = input.reason as string;
        if (!actionUuid || !reason) {
            throw new Error('action_uuid and reason are required');
        }

        const action = await this.managedAgentModel.getAction(actionUuid);
        if (!action) {
            return JSON.stringify({ error: `Action ${actionUuid} not found` });
        }
        if (action.projectUuid !== projectUuid) {
            return JSON.stringify({
                error: `Action does not belong to this project`,
            });
        }
        if (action.reversedAt) {
            return JSON.stringify({
                error: `Action already reversed`,
                reversed_at: action.reversedAt,
            });
        }

        // Perform the reversal
        switch (action.actionType) {
            case ManagedAgentActionType.SOFT_DELETED:
                if (action.targetType === ManagedAgentTargetType.CHART) {
                    await this.savedChartModel.restore(action.targetUuid);
                } else if (
                    action.targetType === ManagedAgentTargetType.DASHBOARD
                ) {
                    await this.dashboardModel.restore(action.targetUuid);
                }
                break;
            case ManagedAgentActionType.CREATED_CONTENT:
                if (action.targetType === ManagedAgentTargetType.CHART) {
                    const settings =
                        await this.managedAgentModel.getSettings(projectUuid);
                    const actorUuid =
                        settings?.enabledByUserUuid ?? projectUuid;
                    await this.savedChartModel.softDelete(
                        action.targetUuid,
                        actorUuid,
                    );
                }
                break;
            default:
                // Flagged/insight actions — just mark as reversed
                break;
        }

        const settings = await this.managedAgentModel.getSettings(projectUuid);
        const actorUuid = settings?.enabledByUserUuid ?? projectUuid;

        const reversed = await this.managedAgentModel.reverseAction(
            actionUuid,
            actorUuid,
        );

        this.logger.info(`Agent reversed action ${actionUuid}: ${reason}`);

        return JSON.stringify({
            reversed: true,
            action_uuid: reversed.actionUuid,
            action_type: reversed.actionType,
            target_name: reversed.targetName,
            reason,
        });
    }
}
