import { subject } from '@casl/ability';
import {
    ForbiddenError,
    ManagedAgentActionType,
    ManagedAgentTargetType,
    NotFoundError,
    ProjectType,
    type ChartConfig,
    type ManagedAgentAction,
    type ManagedAgentActionFilters,
    type ManagedAgentSettings,
    type MetricQuery,
    type SavedChart,
    type SessionUser,
    type UpdateManagedAgentSettings,
    type ValidationResponse,
} from '@lightdash/common';
import type { SlackClient } from '../../../clients/Slack/SlackClient';
import type { LightdashConfig } from '../../../config/parseConfig';
import type { AnalyticsModel } from '../../../models/AnalyticsModel';
import type { DashboardModel } from '../../../models/DashboardModel/DashboardModel';
import type { PersonalAccessTokenModel } from '../../../models/DashboardModel/PersonalAccessTokenModel';
import type { ProjectModel } from '../../../models/ProjectModel/ProjectModel';
import type { SavedChartModel } from '../../../models/SavedChartModel';
import type { SpaceModel } from '../../../models/SpaceModel';
import type { UserModel } from '../../../models/UserModel';
import type { ValidationModel } from '../../../models/ValidationModel/ValidationModel';
import { SchedulerClient } from '../../../scheduler/SchedulerClient';
import { BaseService } from '../../../services/BaseService';
import { ManagedAgentClient } from '../../clients/ManagedAgentClient';
import { ManagedAgentModel } from '../../models/ManagedAgentModel';

type ManagedAgentServiceDependencies = {
    lightdashConfig: LightdashConfig;
    managedAgentModel: ManagedAgentModel;
    analyticsModel: AnalyticsModel;
    projectModel: ProjectModel;
    validationModel: ValidationModel;
    savedChartModel: SavedChartModel;
    dashboardModel: DashboardModel;
    spaceModel: SpaceModel;
    userModel: UserModel;
    personalAccessTokenModel: PersonalAccessTokenModel;
    schedulerClient: SchedulerClient;
    slackClient: SlackClient;
};

export class ManagedAgentService extends BaseService {
    private readonly lightdashConfig: LightdashConfig;

    private readonly managedAgentModel: ManagedAgentModel;

    private readonly analyticsModel: AnalyticsModel;

    private readonly projectModel: ProjectModel;

    private readonly validationModel: ValidationModel;

    private readonly savedChartModel: SavedChartModel;

    private readonly dashboardModel: DashboardModel;

    private readonly spaceModel: SpaceModel;

    private readonly userModel: UserModel;

    private readonly personalAccessTokenModel: PersonalAccessTokenModel;

    private readonly schedulerClient: SchedulerClient;

    private readonly slackClient: SlackClient;

    private client: ManagedAgentClient | null = null;

    constructor(deps: ManagedAgentServiceDependencies) {
        super();
        this.lightdashConfig = deps.lightdashConfig;
        this.managedAgentModel = deps.managedAgentModel;
        this.analyticsModel = deps.analyticsModel;
        this.projectModel = deps.projectModel;
        this.validationModel = deps.validationModel;
        this.savedChartModel = deps.savedChartModel;
        this.dashboardModel = deps.dashboardModel;
        this.spaceModel = deps.spaceModel;
        this.userModel = deps.userModel;
        this.personalAccessTokenModel = deps.personalAccessTokenModel;
        this.schedulerClient = deps.schedulerClient;
        this.slackClient = deps.slackClient;
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

    private async getClient(
        projectUuid: string,
        serviceAccountToken: string,
    ): Promise<ManagedAgentClient> {
        // Always create a fresh client per heartbeat run — persisted resource
        // IDs are loaded from the DB each time so they stay in sync.
        const { anthropicApiKey, sessionTimeoutMs, agentId } =
            this.lightdashConfig.managedAgent;
        if (!anthropicApiKey) {
            throw new Error('ANTHROPIC_API_KEY is required for managed agent');
        }

        const { environmentId, vaultId } =
            await this.managedAgentModel.getAnthropicResourceIds(projectUuid);

        this.client = new ManagedAgentClient({
            anthropicApiKey,
            siteUrl: this.lightdashConfig.siteUrl,
            serviceAccountPat: serviceAccountToken,
            sessionTimeoutMs,
            agentId,
            persistedEnvironmentId: environmentId,
            persistedVaultId: vaultId,
            onResourcesCreated: async (newEnvId, newVaultId) => {
                await this.managedAgentModel.setAnthropicResourceIds(
                    projectUuid,
                    newEnvId,
                    newVaultId,
                );
            },
        });
        return this.client;
    }

    // --- Authorization ---

    private async assertCanViewProject(
        user: SessionUser,
        projectUuid: string,
    ): Promise<void> {
        const { organizationUuid } =
            await this.projectModel.getSummary(projectUuid);
        if (
            user.ability.cannot(
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
        if (
            user.ability.cannot(
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
        const settings = await this.managedAgentModel.upsertSettings(
            projectUuid,
            userUuid,
            update,
        );

        // Auto-create a PAT for MCP auth when enabling the agent
        if (update.enabled) {
            const existingToken =
                await this.managedAgentModel.getServiceAccountToken(
                    projectUuid,
                );
            if (!existingToken) {
                const userDetails =
                    await this.userModel.getUserDetailsByUuid(userUuid);
                const pat = await this.personalAccessTokenModel.create(
                    { userId: userDetails.userId },
                    {
                        description: `Managed Agent (${projectUuid})`,
                        autoGenerated: true,
                        expiresAt: null,
                    },
                );
                await this.managedAgentModel.setServiceAccountToken(
                    projectUuid,
                    pat.token,
                );
                this.logger.info(
                    `Created PAT for managed agent in project ${projectUuid}`,
                );
            }

            // Schedule the first heartbeat job
            const schedule =
                settings.scheduleCron ??
                this.lightdashConfig.managedAgent.schedule;
            await this.schedulerClient.scheduleManagedAgentHeartbeat(schedule);
        } else if (update.enabled === false) {
            // Cancel pending heartbeat when disabling
            await this.schedulerClient.cancelManagedAgentHeartbeat();
        }

        return settings;
    }

    async getEnabledProjects(): Promise<ManagedAgentSettings[]> {
        return this.managedAgentModel.getEnabledProjects();
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
            case ManagedAgentActionType.FLAGGED_STALE:
            case ManagedAgentActionType.FLAGGED_BROKEN:
            case ManagedAgentActionType.INSIGHT:
            case ManagedAgentActionType.FIXED_BROKEN:
                // These are log-only entries — marking as reversed dismisses them
                break;
            default:
                break;
        }

        return this.managedAgentModel.reverseAction(actionUuid, userUuid);
    }

    // --- Heartbeat ---

    async runHeartbeat(projectUuid: string): Promise<void> {
        const settings = await this.managedAgentModel.getSettings(projectUuid);
        if (!settings?.enabled) {
            return;
        }

        // Get the auto-created PAT for MCP auth
        const serviceAccountToken =
            await this.managedAgentModel.getServiceAccountToken(projectUuid);
        if (!serviceAccountToken) {
            this.logger.warn(
                `No service account token for project ${projectUuid}, skipping heartbeat`,
            );
            return;
        }

        this.logger.info(`Running heartbeat for project: ${projectUuid}`);

        const client = await this.getClient(projectUuid, serviceAccountToken);
        let sessionId = '';

        const onToolCall = async (
            toolName: string,
            input: Record<string, unknown>,
        ): Promise<string> =>
            this.handleToolCall(projectUuid, sessionId, toolName, input);

        const onSessionCreated = (id: string) => {
            sessionId = id;
        };

        try {
            sessionId = await client.runSession(
                projectUuid,
                onToolCall,
                onSessionCreated,
            );
            this.logger.info(`Heartbeat complete for project: ${projectUuid}`);
        } catch (error) {
            this.logger.error(
                `Heartbeat session error for project ${projectUuid}: ${error instanceof Error ? error.message : 'Unknown'}`,
            );
        } finally {
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
                );
            }
        }
    }

    private async postHeartbeatSummaryToSlack(
        projectUuid: string,
        sessionId: string,
        slackChannelId: string,
    ): Promise<void> {
        this.logger.info(
            `Posting Slack summary: project=${projectUuid}, session=${sessionId}, channel=${slackChannelId}`,
        );
        try {
            const actions = await this.managedAgentModel.getActions(
                projectUuid,
                { sessionId },
            );

            this.logger.info(
                `Found ${actions.length} actions for session ${sessionId}`,
            );

            if (actions.length === 0) {
                this.logger.info('No actions to report, skipping Slack');
                return;
            }

            const { organizationUuid } =
                await this.projectModel.getSummary(projectUuid);
            const { siteUrl } = this.lightdashConfig;
            const activityUrl = `${siteUrl}/projects/${projectUuid}/improve`;

            // Build action summary counts
            const counts: Record<string, number> = {};
            for (const a of actions) {
                counts[a.actionType] = (counts[a.actionType] || 0) + 1;
            }

            const summaryParts: string[] = [];
            if (counts.fixed_broken)
                summaryParts.push(
                    `*${counts.fixed_broken}* chart${counts.fixed_broken > 1 ? 's' : ''} fixed`,
                );
            if (counts.created_content)
                summaryParts.push(
                    `*${counts.created_content}* chart${counts.created_content > 1 ? 's' : ''} created`,
                );
            if (counts.flagged_stale)
                summaryParts.push(
                    `*${counts.flagged_stale}* item${counts.flagged_stale > 1 ? 's' : ''} flagged as stale`,
                );
            if (counts.flagged_broken)
                summaryParts.push(
                    `*${counts.flagged_broken}* item${counts.flagged_broken > 1 ? 's' : ''} flagged as broken`,
                );
            if (counts.soft_deleted)
                summaryParts.push(
                    `*${counts.soft_deleted}* item${counts.soft_deleted > 1 ? 's' : ''} cleaned up`,
                );
            if (counts.insight)
                summaryParts.push(
                    `*${counts.insight}* insight${counts.insight > 1 ? 's' : ''}`,
                );

            const ACTION_ICONS: Record<string, string> = {
                [ManagedAgentActionType.FIXED_BROKEN]: ':wrench:',
                [ManagedAgentActionType.CREATED_CONTENT]: ':sparkles:',
                [ManagedAgentActionType.FLAGGED_STALE]: ':warning:',
                [ManagedAgentActionType.FLAGGED_BROKEN]: ':x:',
                [ManagedAgentActionType.SOFT_DELETED]: ':wastebasket:',
                [ManagedAgentActionType.INSIGHT]: ':bulb:',
            };

            const RESOURCE_URL_PATTERNS: Record<string, string> = {
                [ManagedAgentTargetType.CHART]: 'saved',
                [ManagedAgentTargetType.DASHBOARD]: 'dashboards',
            };

            // Build per-action detail lines with links
            const detailLines = actions.slice(0, 10).map((a) => {
                const urlSegment = RESOURCE_URL_PATTERNS[a.targetType];
                const resourceUrl = urlSegment
                    ? `${siteUrl}/projects/${projectUuid}/${urlSegment}/${a.targetUuid}`
                    : null;

                const icon = ACTION_ICONS[a.actionType] || ':bulb:';

                const nameLink = resourceUrl
                    ? `<${resourceUrl}|${a.targetName}>`
                    : a.targetName;

                return `${icon} ${nameLink} — ${a.description}`;
            });

            const moreCount = actions.length - 10;
            if (moreCount > 0) {
                detailLines.push(
                    `_...and ${moreCount} more action${moreCount > 1 ? 's' : ''}_`,
                );
            }

            const blocks = [
                {
                    type: 'header' as const,
                    text: {
                        type: 'plain_text' as const,
                        text: ':zap: Improve agent completed a run',
                        emoji: true,
                    },
                },
                {
                    type: 'section' as const,
                    text: {
                        type: 'mrkdwn' as const,
                        text: summaryParts.join('  ·  '),
                    },
                },
                {
                    type: 'section' as const,
                    text: {
                        type: 'mrkdwn' as const,
                        text: detailLines.join('\n'),
                    },
                },
                {
                    type: 'actions' as const,
                    elements: [
                        {
                            type: 'button' as const,
                            text: {
                                type: 'plain_text' as const,
                                text: 'View all activity',
                                emoji: true,
                            },
                            url: activityUrl,
                        },
                    ],
                },
            ];

            await this.slackClient.postMessage({
                organizationUuid,
                channel: slackChannelId,
                text: `Improve agent: ${summaryParts.join(', ')}`,
                blocks,
            });

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
        toolName: string,
        input: Record<string, unknown>,
    ): Promise<string> {
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
                return this.handleFlagContent(projectUuid, sessionId, input);
            case 'soft_delete_content':
                return this.handleSoftDelete(projectUuid, sessionId, input);
            case 'log_insight':
                return this.handleLogInsight(projectUuid, sessionId, input);
            case 'get_chart_details':
                return this.handleGetChartDetails(projectUuid, input);
            case 'get_chart_schema':
                return this.handleGetChartSchema();
            case 'fix_broken_chart':
                return this.handleFixBrokenChart(projectUuid, sessionId, input);
            case 'create_content_from_code':
                return this.handleCreateContent(projectUuid, sessionId, input);
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
        // getUnusedContent returns all content sorted by least-viewed first.
        // We invert: take items with views, sort descending, and cap at 20.
        const unused = await this.analyticsModel.getUnusedContent(projectUuid);
        const allItems = [...unused.charts, ...unused.dashboards]
            .filter((item) => item.viewsCount > 0)
            .sort((a, b) => b.viewsCount - a.viewsCount)
            .slice(0, 20);
        return JSON.stringify(
            allItems.map((item) => ({
                uuid: item.contentUuid,
                name: item.contentName,
                type: item.contentType,
                views_count: item.viewsCount,
                last_viewed_at: item.lastViewedAt?.toISOString() ?? null,
                created_by: item.createdByUserName,
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
            actionType: ManagedAgentActionType.FIXED_BROKEN,
            targetType: ManagedAgentTargetType.CHART,
            targetUuid: chartUuid,
            targetName: chartName,
            description,
            metadata: {},
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
    ]);

    private async handleFlagContent(
        projectUuid: string,
        sessionId: string,
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

        const action = await this.managedAgentModel.createAction({
            projectUuid,
            sessionId,
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

        // Verify entity exists, belongs to this project, and matches declared type
        if (targetType === ManagedAgentTargetType.CHART) {
            const chart = await this.savedChartModel.get(targetUuid);
            ManagedAgentService.assertProjectOwnership(
                chart.projectUuid,
                projectUuid,
                'Chart',
                targetUuid,
            );
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
            await this.dashboardModel.softDelete(targetUuid, actorUuid);
        } else {
            throw new Error(
                `soft_delete_content only supports chart and dashboard, got: ${targetType}`,
            );
        }

        const action = await this.managedAgentModel.createAction({
            projectUuid,
            sessionId,
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
            actionType: ManagedAgentActionType.INSIGHT,
            targetType,
            targetUuid,
            targetName,
            description,
            metadata: (input.metadata as Record<string, unknown>) ?? {},
        });
        return JSON.stringify({ action_uuid: action.actionUuid });
    }
}
