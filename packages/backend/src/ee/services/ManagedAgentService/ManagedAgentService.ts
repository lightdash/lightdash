import { subject } from '@casl/ability';
import {
    AGENT_SUGGESTIONS_SPACE_SLUG,
    assertUnreachable,
    computeAutopilotExcludedSpaceUuids,
    DEFAULT_MANAGED_AGENT_POLICY,
    FeatureFlags,
    ForbiddenError,
    getFixedBrokenMetadata,
    getManagedAgentActionCategory,
    getManagedAgentScheduleCron,
    ManagedAgentActionType,
    ManagedAgentProtectedEntityType,
    ManagedAgentRunStatus,
    ManagedAgentTargetType,
    NotFoundError,
    ParameterError,
    ProjectMemberRole,
    ProjectType,
    ServiceAccountScope,
    ValidationErrorType,
    ValidationSourceType,
    type ChartConfig,
    type ManagedAgentAction,
    type ManagedAgentActionFilters,
    type ManagedAgentAudience,
    type ManagedAgentPolicy,
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
import type { SpacePermissionService } from '../../../services/SpaceService/SpacePermissionService';
import { ValidationService } from '../../../services/ValidationService/ValidationService';
import {
    ManagedAgentClient,
    type ManagedAgentSessionConfig,
} from '../../clients/ManagedAgentClient';
import { ManagedAgentModel } from '../../models/ManagedAgentModel';
import type { ServiceAccountModel } from '../../models/ServiceAccountModel';
import { buildPreAggCandidateSuggestion } from './preAggCandidates';
import {
    buildManagedAgentToolListResult,
    formatManagedAgentToolListResult,
    getManagedAgentToolResultLimit,
    getValidationRootCauseTableName,
    MANAGED_AGENT_BROKEN_CONTENT_GROUP_ITEM_LIMIT,
    MANAGED_AGENT_BULK_DELETE_RUN_LIMIT,
    MANAGED_AGENT_SOFT_DELETE_RUN_LIMIT,
    MANAGED_AGENT_TOOL_RESULT_ITEM_LIMIT,
    summarizeManagedAgentBrokenContent,
} from './toolResults';

type RunsCursor = { startedAt: Date; runUuid: string };

type HeartbeatContext = {
    runUuid: string;
    projectUuid: string;
    organizationUuid: string;
    settings: ManagedAgentSettings | null;
    triggeredBy: ManagedAgentRunTriggeredBy;
    startedAtMs: number;
    analyticsUserId: string | null;
};

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
    write_slack_summary: 'Writing Slack summary',
};

const NON_ACTIVITY_TOOL_NAMES = new Set(['write_slack_summary']);

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
    spacePermissionService: SpacePermissionService;
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

    private readonly spacePermissionService: SpacePermissionService;

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
        this.spacePermissionService = deps.spacePermissionService;
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
        await this.ensureProjectScopedServiceAccount(
            projectUuid,
            serviceAccountToken,
        );

        const {
            agentId,
            agentConfigHash,
            agentVersion,
            environmentId,
            vaultId,
            vaultConfigHash,
        } = await this.managedAgentModel.getAnthropicResourceIds(projectUuid);
        const project = await this.projectModel.getSummary(projectUuid);
        const organization = await this.organizationModel.get(
            project.organizationUuid,
        );
        const settings = await this.managedAgentModel.getSettings(projectUuid);
        const policy = settings?.policy ?? DEFAULT_MANAGED_AGENT_POLICY;

        return {
            projectUuid,
            serviceAccountPat: serviceAccountToken,
            resourceName: `${organization.name}:${organization.organizationUuid}:${project.projectUuid}`,
            skillIds: this.lightdashConfig.managedAgent.skillIds,
            toolSettings: settings?.toolSettings ?? {},
            policy: {
                ...policy,
                audience: await this.resolveSuggestionsAudience(
                    projectUuid,
                    policy.audience,
                ),
            },
            persistedAgentId: agentId,
            persistedAgentConfigHash: agentConfigHash,
            persistedAgentVersion: agentVersion,
            persistedEnvironmentId: environmentId,
            persistedVaultId: vaultId,
            persistedVaultConfigHash: vaultConfigHash,
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
            onResourcesCreated: async (
                newEnvId,
                newVaultId,
                newVaultConfigHash,
            ) => {
                await this.managedAgentModel.setAnthropicResourceIds(
                    projectUuid,
                    newEnvId,
                    newVaultId,
                    newVaultConfigHash,
                );
            },
        };
    }

    private async ensureProjectScopedServiceAccount(
        projectUuid: string,
        serviceAccountToken: string,
    ): Promise<void> {
        const serviceAccount =
            await this.serviceAccountModel.findByToken(serviceAccountToken);
        if (serviceAccount === undefined) {
            throw new NotFoundError('Service account not found for token');
        }
        const projectGrants =
            await this.projectModel.getServiceAccountProjectGrants(
                serviceAccount.uuid,
            );
        const isProjectScoped =
            serviceAccount.scopes.length === 1 &&
            serviceAccount.scopes[0] === ServiceAccountScope.SYSTEM_MEMBER &&
            projectGrants.length === 1 &&
            projectGrants[0].projectUuid === projectUuid &&
            projectGrants[0].role === ProjectMemberRole.EDITOR &&
            projectGrants[0].roleUuid === null;

        if (isProjectScoped) {
            return;
        }

        await this.projectModel.setServiceAccountProjectAccess(
            serviceAccount.uuid,
            [
                {
                    projectUuid,
                    role: ProjectMemberRole.EDITOR,
                },
            ],
            { makeProjectScoped: true },
        );
        this.logger.info(
            `Restricted managed agent service account to project ${projectUuid}`,
        );
    }

    private async createProjectScopedServiceAccount(
        user: SessionUser,
        projectUuid: string,
        organizationUuid: string,
    ): Promise<string> {
        const serviceAccount = await this.serviceAccountModel.create({
            user,
            data: {
                organizationUuid,
                description: `Autopilot (${projectUuid})`,
                expiresAt: null,
                scopes: [ServiceAccountScope.SYSTEM_MEMBER],
            },
        });

        try {
            await this.projectModel.createServiceAccountProjectAccess(
                projectUuid,
                serviceAccount.uuid,
                {
                    role: ProjectMemberRole.EDITOR,
                    roleUuid: undefined,
                },
            );
        } catch (error) {
            await this.serviceAccountModel.delete(serviceAccount.uuid);
            throw error;
        }

        return serviceAccount.token;
    }

    private async getPolicy(projectUuid: string): Promise<ManagedAgentPolicy> {
        const settings = await this.managedAgentModel.getSettings(projectUuid);
        return settings?.policy ?? DEFAULT_MANAGED_AGENT_POLICY;
    }

    // Spaces Autopilot must not see, per the project's scope mode and space
    // selection. Selections inherit down the space tree; the Agent Suggestions
    // space is always in scope.
    private async getExcludedSpaceUuids(
        projectUuid: string,
    ): Promise<Set<string>> {
        const settings = await this.managedAgentModel.getSettings(projectUuid);
        const mode =
            settings?.policy.spaceScopeMode ??
            DEFAULT_MANAGED_AGENT_POLICY.spaceScopeMode;
        const selected = settings?.scopedSpaceUuids ?? [];
        if (mode === 'all-except' && selected.length === 0) {
            return new Set();
        }
        const spaces = await this.spaceModel.find({ projectUuid });
        return computeAutopilotExcludedSpaceUuids(
            spaces.map((space) => ({
                uuid: space.uuid,
                parentSpaceUuid: space.parentSpaceUuid,
                slug: space.slug,
            })),
            mode,
            selected,
        );
    }

    // Single choke point for admin-configured protections. Returns a blocked
    // tool result when the target may not be mutated, null when allowed.
    // When `attempt` is provided, blocked attempts are recorded as dismissable
    // 'blocked' actions so admins can see Autopilot tried and was stopped.
    private async checkTargetProtectionGuard(
        projectUuid: string,
        targetType: ManagedAgentTargetType,
        targetUuid: string,
        targetName: string,
        attempt?: {
            actor: SessionUser;
            sessionId: string;
            runUuid: string;
            attemptedAction: 'flag' | 'fix' | 'soft-delete';
        },
    ): Promise<string | null> {
        let entityType: ManagedAgentProtectedEntityType;
        switch (targetType) {
            case ManagedAgentTargetType.CHART:
                entityType = ManagedAgentProtectedEntityType.CHART;
                break;
            case ManagedAgentTargetType.DASHBOARD:
                entityType = ManagedAgentProtectedEntityType.DASHBOARD;
                break;
            case ManagedAgentTargetType.SPACE:
            case ManagedAgentTargetType.PROJECT:
                return null;
            default:
                return assertUnreachable(
                    targetType,
                    `Unknown target type: ${targetType}`,
                );
        }

        let blocked: { reason: string; message: string } | null = null;

        const level = await this.managedAgentModel.findProtectionLevel(
            projectUuid,
            entityType,
            targetUuid,
        );
        if (level) {
            blocked = {
                reason: level,
                message: `"${targetName}" is ${level} from Autopilot by a project admin. Do not flag, fix, or delete it${
                    level === 'excluded' ? ', and do not report on it' : ''
                }.`,
            };
        }

        // Verified content is protected by default: a human vouched for the
        // definition, so Autopilot reports instead of rewriting.
        if (!blocked) {
            const policy = await this.getPolicy(projectUuid);
            if (policy.verifiedContent === 'protected') {
                const isVerified =
                    await this.managedAgentModel.isContentVerified(
                        entityType === ManagedAgentProtectedEntityType.CHART
                            ? 'chart'
                            : 'dashboard',
                        targetUuid,
                    );
                if (isVerified) {
                    blocked = {
                        reason: 'verified',
                        message: `"${targetName}" is verified content and protected by project policy. You may report on it with log_insight, but do not flag, fix, or delete it.`,
                    };
                }
            }
        }

        // Defense in depth: content living in an out-of-scope space cannot be
        // mutated even if a read tool leaked it.
        if (!blocked) {
            const spaceUuid =
                entityType === ManagedAgentProtectedEntityType.CHART
                    ? await this.managedAgentModel.getChartSpaceUuid(targetUuid)
                    : await this.managedAgentModel.getDashboardSpaceUuid(
                          targetUuid,
                      );
            if (spaceUuid) {
                const excludedSpaces =
                    await this.getExcludedSpaceUuids(projectUuid);
                if (excludedSpaces.has(spaceUuid)) {
                    blocked = {
                        reason: 'out_of_scope',
                        message: `"${targetName}" is in a space that is out of Autopilot's scope. Do not flag, fix, delete, or report on it.`,
                    };
                }
            }
        }

        if (!blocked) {
            return null;
        }

        if (attempt) {
            await this.recordBlockedAttempt(
                projectUuid,
                targetType,
                targetUuid,
                targetName,
                blocked.reason,
                attempt,
            );
        }

        return JSON.stringify({ error: blocked.message, blocked: true });
    }

    // One live blocked action per target: repeat attempts on the same target
    // do not pile up until the admin dismisses the existing one.
    private async recordBlockedAttempt(
        projectUuid: string,
        targetType: ManagedAgentTargetType,
        targetUuid: string,
        targetName: string,
        reason: string,
        attempt: {
            actor: SessionUser;
            sessionId: string;
            runUuid: string;
            attemptedAction: 'flag' | 'fix' | 'soft-delete';
        },
    ): Promise<void> {
        try {
            const alreadyRecorded =
                await this.managedAgentModel.hasActiveBlockedActionForTarget(
                    projectUuid,
                    targetUuid,
                );
            if (alreadyRecorded) {
                return;
            }
            const reasonText: Record<string, string> = {
                protected: 'it is marked as protected by a project admin',
                excluded: 'it is excluded from Autopilot by a project admin',
                verified: 'it is verified content, protected by project policy',
                out_of_scope: "its space is out of Autopilot's scope",
            };
            const action = await this.managedAgentModel.createAction({
                projectUuid,
                sessionId: attempt.sessionId,
                managedAgentRunUuid: attempt.runUuid,
                actionType: ManagedAgentActionType.BLOCKED,
                targetType,
                targetUuid,
                targetName,
                description: `Autopilot attempted to ${attempt.attemptedAction} "${targetName}" but was blocked: ${
                    reasonText[reason] ?? reason
                }.`,
                metadata: {
                    reason,
                    attemptedAction: attempt.attemptedAction,
                },
            });
            this.trackActionCreated(attempt.actor, attempt.runUuid, action);
        } catch (error) {
            this.logger.error(
                `Failed to record blocked Autopilot attempt for ${targetUuid}: ${
                    error instanceof Error ? error.message : 'Unknown'
                }`,
            );
        }
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

    private async getAutopilotActor(projectUuid: string): Promise<SessionUser> {
        const settings = await this.managedAgentModel.getSettings(projectUuid);
        const enabledByUserUuid = settings?.enabledByUserUuid;
        if (!enabledByUserUuid) {
            throw new ForbiddenError(
                `Autopilot actor is not configured for project ${projectUuid}`,
            );
        }

        const { organizationUuid } =
            await this.projectModel.getSummary(projectUuid);
        return this.userModel.findSessionUserAndOrgByUuid(
            enabledByUserUuid,
            organizationUuid,
        );
    }

    private async canActorViewProject(
        actor: SessionUser,
        projectUuid: string,
    ): Promise<boolean> {
        const { organizationUuid } =
            await this.projectModel.getSummary(projectUuid);
        const auditedAbility = this.createAuditedAbility(actor);
        return auditedAbility.can(
            'view',
            subject('Project', {
                organizationUuid,
                projectUuid,
                metadata: { projectUuid },
            }),
        );
    }

    private async assertActorCanViewProject(
        actor: SessionUser,
        projectUuid: string,
    ): Promise<void> {
        if (!(await this.canActorViewProject(actor, projectUuid))) {
            throw new ForbiddenError(
                `Autopilot actor cannot view project ${projectUuid}`,
            );
        }
    }

    private async assertActorCanManageProject(
        actor: SessionUser,
        projectUuid: string,
    ): Promise<void> {
        const { organizationUuid } =
            await this.projectModel.getSummary(projectUuid);
        const auditedAbility = this.createAuditedAbility(actor);
        if (
            auditedAbility.cannot(
                'update',
                subject('Project', {
                    organizationUuid,
                    projectUuid,
                    metadata: { projectUuid },
                }),
            )
        ) {
            throw new ForbiddenError(
                `Autopilot actor cannot manage project ${projectUuid}`,
            );
        }
    }

    private async getChartAccessContext(
        actor: SessionUser,
        chart: {
            spaceUuid: string;
        },
    ): Promise<{
        inheritsFromOrgOrProject: boolean;
        access: unknown[];
    }> {
        const { inheritsFromOrgOrProject, access } =
            await this.spacePermissionService.getSpaceAccessContext(
                actor.userUuid,
                chart.spaceUuid,
            );
        return { inheritsFromOrgOrProject, access };
    }

    private async canActorViewChart(
        actor: SessionUser,
        chart: {
            uuid: string;
            name: string;
            organizationUuid: string;
            projectUuid: string;
            spaceUuid: string;
        },
    ): Promise<boolean> {
        const { inheritsFromOrgOrProject, access } =
            await this.getChartAccessContext(actor, chart);
        const auditedAbility = this.createAuditedAbility(actor);
        return auditedAbility.can(
            'view',
            subject('SavedChart', {
                organizationUuid: chart.organizationUuid,
                projectUuid: chart.projectUuid,
                inheritsFromOrgOrProject,
                access,
                metadata: {
                    savedChartUuid: chart.uuid,
                    savedChartName: chart.name,
                },
            }),
        );
    }

    private async assertActorCanUpdateChart(
        actor: SessionUser,
        chart: {
            uuid: string;
            name: string;
            organizationUuid: string;
            projectUuid: string;
            spaceUuid: string;
        },
    ): Promise<void> {
        const { inheritsFromOrgOrProject, access } =
            await this.getChartAccessContext(actor, chart);
        const auditedAbility = this.createAuditedAbility(actor);
        if (
            auditedAbility.cannot(
                'update',
                subject('SavedChart', {
                    organizationUuid: chart.organizationUuid,
                    projectUuid: chart.projectUuid,
                    inheritsFromOrgOrProject,
                    access,
                    metadata: {
                        savedChartUuid: chart.uuid,
                        savedChartName: chart.name,
                    },
                }),
            )
        ) {
            throw new ForbiddenError(
                `Autopilot actor cannot update chart ${chart.uuid}`,
            );
        }
    }

    private async assertActorCanDeleteChart(
        actor: SessionUser,
        chart: {
            uuid: string;
            name: string;
            organizationUuid: string;
            projectUuid: string;
            spaceUuid: string;
        },
    ): Promise<void> {
        const { inheritsFromOrgOrProject, access } =
            await this.getChartAccessContext(actor, chart);
        const auditedAbility = this.createAuditedAbility(actor);
        if (
            auditedAbility.cannot(
                'delete',
                subject('SavedChart', {
                    organizationUuid: chart.organizationUuid,
                    projectUuid: chart.projectUuid,
                    inheritsFromOrgOrProject,
                    access,
                    metadata: {
                        savedChartUuid: chart.uuid,
                        savedChartName: chart.name,
                    },
                }),
            )
        ) {
            throw new ForbiddenError(
                `Autopilot actor cannot delete chart ${chart.uuid}`,
            );
        }
    }

    private async assertActorCanRestoreChart(
        actor: SessionUser,
        chart: {
            uuid: string;
            organizationUuid: string;
            projectUuid: string;
            deletedBy?: {
                userUuid: string;
            } | null;
        },
    ): Promise<void> {
        await this.assertActorCanViewProject(actor, chart.projectUuid);

        const auditedAbility = this.createAuditedAbility(actor);
        const canManageDeletedContent = auditedAbility.can(
            'manage',
            subject('DeletedContent', {
                organizationUuid: chart.organizationUuid,
                projectUuid: chart.projectUuid,
                metadata: { savedChartUuid: chart.uuid },
            }),
        );

        if (
            !canManageDeletedContent &&
            chart.deletedBy?.userUuid !== actor.userUuid
        ) {
            throw new ForbiddenError(
                `Autopilot actor cannot restore chart ${chart.uuid}`,
            );
        }
    }

    private async assertActorCanCreateSpace(
        actor: SessionUser,
        projectUuid: string,
        spaceName: string,
    ): Promise<void> {
        const { organizationUuid } =
            await this.projectModel.getSummary(projectUuid);
        const auditedAbility = this.createAuditedAbility(actor);
        if (
            auditedAbility.cannot(
                'create',
                subject('Space', {
                    organizationUuid,
                    projectUuid,
                    metadata: { spaceName },
                }),
            )
        ) {
            throw new ForbiddenError(
                `Autopilot actor cannot create space "${spaceName}"`,
            );
        }
    }

    private async assertActorCanCreateChart(
        actor: SessionUser,
        projectUuid: string,
        spaceUuid: string,
        chartName: string,
    ): Promise<void> {
        const { organizationUuid } =
            await this.projectModel.getSummary(projectUuid);
        const { inheritsFromOrgOrProject, access } =
            await this.spacePermissionService.getSpaceAccessContext(
                actor.userUuid,
                spaceUuid,
            );
        const auditedAbility = this.createAuditedAbility(actor);
        if (
            auditedAbility.cannot(
                'create',
                subject('SavedChart', {
                    organizationUuid,
                    projectUuid,
                    inheritsFromOrgOrProject,
                    access,
                    metadata: { savedChartName: chartName },
                }),
            )
        ) {
            throw new ForbiddenError(
                `Autopilot actor cannot create chart "${chartName}"`,
            );
        }
    }

    private async getDashboardAccessContext(
        actor: SessionUser,
        dashboard: {
            spaceUuid: string;
        },
    ): Promise<{
        inheritsFromOrgOrProject: boolean;
        access: unknown[];
    }> {
        const { inheritsFromOrgOrProject, access } =
            await this.spacePermissionService.getSpaceAccessContext(
                actor.userUuid,
                dashboard.spaceUuid,
            );
        return { inheritsFromOrgOrProject, access };
    }

    private async canActorViewDashboard(
        actor: SessionUser,
        dashboard: {
            uuid: string;
            name: string;
            organizationUuid: string;
            projectUuid: string;
            spaceUuid: string;
        },
    ): Promise<boolean> {
        const { inheritsFromOrgOrProject, access } =
            await this.getDashboardAccessContext(actor, dashboard);
        const auditedAbility = this.createAuditedAbility(actor);
        return auditedAbility.can(
            'view',
            subject('Dashboard', {
                organizationUuid: dashboard.organizationUuid,
                projectUuid: dashboard.projectUuid,
                inheritsFromOrgOrProject,
                access,
                metadata: {
                    dashboardUuid: dashboard.uuid,
                    dashboardName: dashboard.name,
                },
            }),
        );
    }

    private async assertActorCanDeleteDashboard(
        actor: SessionUser,
        dashboard: {
            uuid: string;
            name: string;
            organizationUuid: string;
            projectUuid: string;
            spaceUuid: string;
        },
    ): Promise<void> {
        const { inheritsFromOrgOrProject, access } =
            await this.getDashboardAccessContext(actor, dashboard);
        const auditedAbility = this.createAuditedAbility(actor);
        if (
            auditedAbility.cannot(
                'delete',
                subject('Dashboard', {
                    organizationUuid: dashboard.organizationUuid,
                    projectUuid: dashboard.projectUuid,
                    inheritsFromOrgOrProject,
                    access,
                    metadata: {
                        dashboardUuid: dashboard.uuid,
                        dashboardName: dashboard.name,
                    },
                }),
            )
        ) {
            throw new ForbiddenError(
                `Autopilot actor cannot delete dashboard ${dashboard.uuid}`,
            );
        }
    }

    private async assertActorCanRestoreDashboard(
        actor: SessionUser,
        dashboard: {
            uuid: string;
            organizationUuid: string;
            projectUuid: string;
        },
    ): Promise<void> {
        const auditedAbility = this.createAuditedAbility(actor);
        if (
            auditedAbility.cannot(
                'manage',
                subject('DeletedContent', {
                    organizationUuid: dashboard.organizationUuid,
                    projectUuid: dashboard.projectUuid,
                    metadata: { dashboardUuid: dashboard.uuid },
                }),
            )
        ) {
            throw new ForbiddenError(
                `Autopilot actor cannot restore dashboard ${dashboard.uuid}`,
            );
        }
    }

    private async canActorViewTarget(
        actor: SessionUser,
        projectUuid: string,
        targetType: ManagedAgentTargetType,
        targetUuid: string,
    ): Promise<boolean> {
        try {
            switch (targetType) {
                case ManagedAgentTargetType.CHART: {
                    const chart = await this.savedChartModel.get(
                        targetUuid,
                        undefined,
                        { deleted: 'any' },
                    );
                    return await this.canActorViewChart(actor, chart);
                }
                case ManagedAgentTargetType.DASHBOARD: {
                    const dashboard = await this.dashboardModel.getByIdOrSlug(
                        targetUuid,
                        { deleted: 'any' },
                    );
                    return await this.canActorViewDashboard(actor, dashboard);
                }
                case ManagedAgentTargetType.PROJECT:
                    return await this.canActorViewProject(actor, targetUuid);
                default:
                    return await this.canActorViewProject(actor, projectUuid);
            }
        } catch {
            return false;
        }
    }

    private createContentVisibilityChecker(
        actor: SessionUser,
        projectUuid: string,
    ): {
        canViewChartUuid: (chartUuid: string) => Promise<boolean>;
        canViewDashboardUuid: (dashboardUuid: string) => Promise<boolean>;
    } {
        const chartVisibilityCache = new Map<string, Promise<boolean>>();
        const dashboardVisibilityCache = new Map<string, Promise<boolean>>();
        // Lazy so callers that never resolve a uuid do not pay for it
        let excludedSpacesPromise: Promise<Set<string>> | null = null;
        const getExcludedSpaces = () => {
            if (!excludedSpacesPromise) {
                excludedSpacesPromise = this.getExcludedSpaceUuids(projectUuid);
            }
            return excludedSpacesPromise;
        };

        const getCachedVisibility = (
            cache: Map<string, Promise<boolean>>,
            uuid: string,
            loadVisibility: () => Promise<boolean>,
        ): Promise<boolean> => {
            const cachedVisibility = cache.get(uuid);
            if (cachedVisibility) {
                return cachedVisibility;
            }

            const visibility = loadVisibility().catch(() => false);
            cache.set(uuid, visibility);
            return visibility;
        };

        return {
            canViewChartUuid: (chartUuid: string) =>
                getCachedVisibility(
                    chartVisibilityCache,
                    chartUuid,
                    async () => {
                        const chart = await this.savedChartModel.get(
                            chartUuid,
                            undefined,
                            { deleted: 'any' },
                        );
                        if ((await getExcludedSpaces()).has(chart.spaceUuid)) {
                            return false;
                        }
                        return this.canActorViewChart(actor, chart);
                    },
                ),
            canViewDashboardUuid: (dashboardUuid: string) =>
                getCachedVisibility(
                    dashboardVisibilityCache,
                    dashboardUuid,
                    async () => {
                        const dashboard =
                            await this.dashboardModel.getByIdOrSlug(
                                dashboardUuid,
                                { deleted: 'any' },
                            );
                        if (
                            (await getExcludedSpaces()).has(dashboard.spaceUuid)
                        ) {
                            return false;
                        }
                        return this.canActorViewDashboard(actor, dashboard);
                    },
                ),
        };
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

        // Space scope updates replace the selection atomically and keep the
        // mode on the policy object. Reject uuids from other projects.
        let effectiveUpdate = update;
        if (update.spaceScope !== undefined) {
            const projectSpaces = await this.spaceModel.find({ projectUuid });
            const validSpaceUuids = new Set(
                projectSpaces.map((space) => space.uuid),
            );
            await this.managedAgentModel.replaceSpaceScope(
                projectUuid,
                update.spaceScope.mode,
                update.spaceScope.spaceUuids.filter((spaceUuid) =>
                    validSpaceUuids.has(spaceUuid),
                ),
                userUuid,
            );
            effectiveUpdate = {
                ...update,
                policy: {
                    ...update.policy,
                    spaceScopeMode: update.spaceScope.mode,
                },
            };
        }

        const settings = await this.managedAgentModel.upsertSettings(
            projectUuid,
            userUuid,
            effectiveUpdate,
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
                const serviceAccountToken =
                    await this.createProjectScopedServiceAccount(
                        user,
                        projectUuid,
                        organizationUuid,
                    );
                await this.managedAgentModel.setServiceAccountToken(
                    projectUuid,
                    serviceAccountToken,
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

        if (
            update.enabled ||
            update.toolSettings !== undefined ||
            update.policy !== undefined
        ) {
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
                await this.restorePreviousChartVersion(action, user);
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
        user: SessionUser,
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
            user,
        );
    }

    // --- Heartbeat ---

    async runHeartbeat(projectUuid: string, runUuid: string): Promise<void> {
        const ctx = await this.loadHeartbeatContext(projectUuid, runUuid);
        if (!ctx) return;

        this.trackRunStarted(ctx);

        if (!ctx.settings?.enabled) {
            await this.failRunSafely(ctx, 'Autopilot disabled');
            return;
        }

        const serviceAccountToken =
            await this.managedAgentModel.getServiceAccountToken(projectUuid);
        if (!serviceAccountToken) {
            this.logger.warn(
                `No service account token for project ${projectUuid}, skipping heartbeat`,
            );
            await this.failRunSafely(ctx, 'No service account token');
            return;
        }

        this.logger.info(`Running heartbeat for project: ${projectUuid}`);

        const sessionConfig = await this.getSessionConfig(
            projectUuid,
            serviceAccountToken,
        );
        let sessionId = '';
        let slackSummary = '';
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
            slackSummary = result.slackSummary ?? '';
            this.logger.info(`Heartbeat complete for project: ${projectUuid}`);
        } catch (error) {
            this.logger.error(
                `Heartbeat session error for project ${projectUuid}: ${error instanceof Error ? error.message : 'Unknown'}`,
            );
            runError = error instanceof Error ? error.message : 'Unknown';
        } finally {
            const actionCountsByType = await this.managedAgentModel
                .getActionCountsByTypeForRun(runUuid)
                .catch(() => ({}) as Record<string, number>);
            const actionCount = Object.values(actionCountsByType).reduce(
                (sum, n) => sum + n,
                0,
            );
            await this.managedAgentModel
                .finishRun(runUuid, {
                    status: runError
                        ? ManagedAgentRunStatus.ERROR
                        : ManagedAgentRunStatus.COMPLETED,
                    actionCount,
                    summary: slackSummary || null,
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
            const slackPosted = await this.maybePostHeartbeatSlackSummary(
                ctx,
                sessionId,
                slackSummary,
            );

            this.trackRunCompleted(ctx, {
                status: runError ? 'error' : 'completed',
                actionCount,
                actionCountsByType,
                slackPosted,
                error: runError,
            });
        }
    }

    private async loadHeartbeatContext(
        projectUuid: string,
        runUuid: string,
    ): Promise<HeartbeatContext | null> {
        const run = await this.managedAgentModel.getRun(runUuid);
        if (!run) {
            this.logger.error(`Run ${runUuid} not found, aborting heartbeat`);
            return null;
        }
        const settings = await this.managedAgentModel.getSettings(projectUuid);
        const { organizationUuid } =
            await this.projectModel.getSummary(projectUuid);
        return {
            runUuid,
            projectUuid,
            organizationUuid,
            settings,
            triggeredBy: run.triggeredBy,
            startedAtMs: run.startedAt.getTime(),
            analyticsUserId: settings?.enabledByUserUuid ?? null,
        };
    }

    private trackRunStarted(ctx: HeartbeatContext): void {
        if (!ctx.analyticsUserId) {
            this.logger.warn(
                `Skipping run_started analytics — no enabledByUserUuid for run ${ctx.runUuid}`,
            );
            return;
        }
        this.analytics.track({
            event: 'managed_agent.run_started',
            userId: ctx.analyticsUserId,
            properties: {
                organizationId: ctx.organizationUuid,
                projectId: ctx.projectUuid,
                runUuid: ctx.runUuid,
                triggeredBy: ctx.triggeredBy,
                schedule: ctx.settings?.schedule ?? 'unknown',
                hasSlackChannel: !!ctx.settings?.slackChannelId,
            },
        });
    }

    private trackActionCreated(
        actor: SessionUser,
        runUuid: string,
        action: ManagedAgentAction,
    ): void {
        if (!actor.userUuid || !actor.organizationUuid) {
            this.logger.warn(
                `Skipping action_created analytics — actor missing userUuid or organizationUuid (action ${action.actionUuid})`,
            );
            return;
        }
        this.analytics.track({
            event: 'managed_agent.action_created',
            userId: actor.userUuid,
            properties: {
                organizationId: actor.organizationUuid,
                projectId: action.projectUuid,
                runUuid,
                sessionId: action.sessionId,
                actionType: action.actionType,
                targetType: action.targetType,
            },
        });
    }

    private trackRunCompleted(
        ctx: HeartbeatContext,
        outcome: {
            status: 'completed' | 'error';
            actionCount: number;
            actionCountsByType: Record<string, number>;
            slackPosted: boolean;
            error: string | null;
        },
    ): void {
        if (!ctx.analyticsUserId) {
            this.logger.warn(
                `Skipping run_completed analytics — no enabledByUserUuid for run ${ctx.runUuid}`,
            );
            return;
        }
        this.analytics.track({
            event: 'managed_agent.run_completed',
            userId: ctx.analyticsUserId,
            properties: {
                organizationId: ctx.organizationUuid,
                projectId: ctx.projectUuid,
                runUuid: ctx.runUuid,
                triggeredBy: ctx.triggeredBy,
                status: outcome.status,
                durationMs: Date.now() - ctx.startedAtMs,
                actionCount: outcome.actionCount,
                actionCountsByType: outcome.actionCountsByType,
                slackPosted: outcome.slackPosted,
                error: outcome.error ? outcome.error.slice(0, 500) : null,
            },
        });
    }

    private async maybePostHeartbeatSlackSummary(
        ctx: HeartbeatContext,
        sessionId: string,
        agentSummary: string,
    ): Promise<boolean> {
        const slackChannelId = ctx.settings?.slackChannelId;
        this.logger.info(
            `Slack notification check: slackChannelId=${slackChannelId ?? 'null'}, sessionId=${sessionId || 'empty'}`,
        );
        if (!slackChannelId || !sessionId) return false;
        try {
            await this.postHeartbeatSummaryToSlack(
                ctx.projectUuid,
                sessionId,
                slackChannelId,
                agentSummary,
            );
            return true;
        } catch (e) {
            this.logger.error(
                `Failed to post Slack heartbeat summary for ${ctx.projectUuid}: ${
                    e instanceof Error ? e.message : 'Unknown'
                }`,
            );
            return false;
        }
    }

    private async failRunSafely(
        ctx: HeartbeatContext,
        error: string,
    ): Promise<void> {
        await this.managedAgentModel
            .finishRun(ctx.runUuid, {
                status: ManagedAgentRunStatus.ERROR,
                actionCount: 0,
                summary: null,
                error,
            })
            .catch((e) =>
                this.logger.error(
                    `Failed to fail run ${ctx.runUuid}: ${
                        e instanceof Error ? e.message : 'Unknown'
                    }`,
                ),
            );
        this.trackRunCompleted(ctx, {
            status: 'error',
            actionCount: 0,
            actionCountsByType: {},
            slackPosted: false,
            error,
        });
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
            if (counts.blocked)
                summaryParts.push(`*${counts.blocked}* blocked by protections`);

            // Convert agent's markdown summary to Slack mrkdwn
            // Main message: compact summary with CTA
            const mainBlocks: KnownBlock[] = [
                {
                    type: 'markdown',
                    text: `### Autopilot health check\n${summaryParts.length > 0 ? summaryParts.join('  ·  ') : '_No actions this run_'}`,
                } as unknown as KnownBlock,
                {
                    type: 'actions',
                    elements: [
                        {
                            type: 'button',
                            text: {
                                type: 'plain_text',
                                text: 'View activity',
                                emoji: true,
                            },
                            url: activityUrl,
                        },
                    ],
                } as KnownBlock,
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
                                type: 'markdown',
                                text: chunk,
                            } as unknown as KnownBlock,
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
        if (!NON_ACTIVITY_TOOL_NAMES.has(toolName)) {
            void this.managedAgentModel
                .setCurrentActivity(runUuid, friendlyToolLabel(toolName))
                .catch((e) =>
                    this.logger.warn(
                        `Failed to update current_activity for run ${runUuid}: ${
                            e instanceof Error ? e.message : 'Unknown'
                        }`,
                    ),
                );
        }
        const actor = await this.getAutopilotActor(projectUuid);
        await this.assertActorCanViewProject(actor, projectUuid);
        switch (toolName) {
            case 'get_recent_actions':
                return this.handleGetRecentActions(
                    actor,
                    projectUuid,
                    input.limit as number | undefined,
                );
            case 'get_stale_charts':
                return this.handleGetStaleContent(actor, projectUuid, 'charts');
            case 'get_stale_dashboards':
                return this.handleGetStaleContent(
                    actor,
                    projectUuid,
                    'dashboards',
                );
            case 'get_broken_content':
                return this.handleGetBrokenContent(actor, projectUuid, input);
            case 'get_preview_projects':
                return this.handleGetPreviewProjects(actor, projectUuid);
            case 'get_popular_content':
                return this.handleGetPopularContent(actor, projectUuid);
            case 'flag_content':
                return this.handleFlagContent(
                    actor,
                    projectUuid,
                    sessionId,
                    runUuid,
                    input,
                );
            case 'soft_delete_content':
                return this.handleSoftDelete(
                    actor,
                    projectUuid,
                    sessionId,
                    runUuid,
                    input,
                );
            case 'bulk_delete_broken_content':
                return this.handleBulkDeleteBrokenContent(
                    actor,
                    projectUuid,
                    sessionId,
                    runUuid,
                    input,
                );
            case 'log_insight':
                return this.handleLogInsight(
                    actor,
                    projectUuid,
                    sessionId,
                    runUuid,
                    input,
                );
            case 'get_chart_details':
                return this.handleGetChartDetails(actor, projectUuid, input);
            case 'get_chart_schema':
                return this.handleGetChartSchema();
            case 'fix_broken_chart':
                return this.handleFixBrokenChart(
                    actor,
                    projectUuid,
                    sessionId,
                    runUuid,
                    input,
                );
            case 'create_content_from_code':
                return this.handleCreateContent(
                    actor,
                    projectUuid,
                    sessionId,
                    runUuid,
                    input,
                );
            case 'get_user_questions':
                return this.handleGetUserQuestions(actor, projectUuid, input);
            case 'get_slow_queries':
                return this.handleGetSlowQueries(actor, projectUuid, input);
            case 'get_inactive_users':
                return this.handleGetInactiveUsers(projectUuid, input);
            case 'get_orphaned_content':
                return this.handleGetOrphanedContent(actor, projectUuid, input);
            case 'get_unused_agents':
                return this.handleGetUnusedAgents(projectUuid, input);
            case 'get_preagg_candidates':
                return this.handleGetPreAggCandidates(projectUuid, input);
            case 'reverse_own_action':
                return this.handleReverseOwnAction(actor, projectUuid, input);
            default:
                return JSON.stringify({ error: `Unknown tool: ${toolName}` });
        }
    }

    private async handleGetRecentActions(
        actor: SessionUser,
        projectUuid: string,
        limit?: number,
    ): Promise<string> {
        const actions = await this.managedAgentModel.getRecentActions(
            projectUuid,
            getManagedAgentToolResultLimit(limit, 50),
        );
        const visibleActions = (
            await Promise.all(
                actions.map(async (action) =>
                    (await this.canActorViewTarget(
                        actor,
                        projectUuid,
                        action.targetType,
                        action.targetUuid,
                    ))
                        ? action
                        : null,
                ),
            )
        ).filter((action): action is ManagedAgentAction => action !== null);
        return formatManagedAgentToolListResult(
            visibleActions.map((a) => ({
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
        actor: SessionUser,
        projectUuid: string,
        type: 'charts' | 'dashboards',
    ): Promise<string> {
        const policy = await this.getPolicy(projectUuid);
        const [unused, excludedSpaces] = await Promise.all([
            this.analyticsModel.getUnusedContent(projectUuid, {
                stalenessChartDays: policy.stalenessChartDays,
                stalenessDashboardDays: policy.stalenessDashboardDays,
                protectRecentDays: policy.protectRecentDays,
                limit: 50,
            }),
            this.getExcludedSpaceUuids(projectUuid),
        ]);
        const items = (
            type === 'charts' ? unused.charts : unused.dashboards
        ).filter((item) => !excludedSpaces.has(item.spaceUuid));
        const visibleItems = (
            await Promise.all(
                items.map(async (item) => {
                    if (item.contentType === 'chart') {
                        const chart = await this.savedChartModel.get(
                            item.contentUuid,
                            undefined,
                            { deleted: 'any' },
                        );
                        return (await this.canActorViewChart(actor, chart))
                            ? item
                            : null;
                    }

                    const dashboard = await this.dashboardModel.getByIdOrSlug(
                        item.contentUuid,
                        { deleted: 'any' },
                    );
                    return (await this.canActorViewDashboard(actor, dashboard))
                        ? item
                        : null;
                }),
            )
        ).filter((item) => item !== null);
        return formatManagedAgentToolListResult(
            visibleItems.map((item) => ({
                uuid: item.contentUuid,
                name: item.contentName,
                type: item.contentType,
                last_viewed_at: item.lastViewedAt?.toISOString() ?? null,
                views_count: item.viewsCount,
                reason: item.reason,
                created_by: item.createdByUserName,
                created_at: item.createdAt.toISOString(),
            })),
        );
    }

    private async mapVisibleBrokenContentRows(
        actor: SessionUser,
        projectUuid: string,
        validations: ValidationResponse[],
    ) {
        const { canViewChartUuid, canViewDashboardUuid } =
            this.createContentVisibilityChecker(actor, projectUuid);

        return (
            await Promise.all(
                validations.map(async (validation) => {
                    if ('chartUuid' in validation && validation.chartUuid) {
                        if (!(await canViewChartUuid(validation.chartUuid))) {
                            return null;
                        }
                        return {
                            uuid: validation.chartUuid,
                            name: validation.name ?? 'Unknown',
                            type: 'chart' as const,
                            error: validation.error,
                            error_type: validation.errorType,
                            source: validation.source,
                        };
                    }

                    if (
                        'dashboardUuid' in validation &&
                        validation.dashboardUuid
                    ) {
                        if (
                            !(await canViewDashboardUuid(
                                validation.dashboardUuid,
                            ))
                        ) {
                            return null;
                        }
                        return {
                            uuid: validation.dashboardUuid,
                            name: validation.name ?? 'Unknown',
                            type: 'dashboard' as const,
                            error: validation.error,
                            error_type: validation.errorType,
                            source: validation.source,
                        };
                    }

                    return null;
                }),
            )
        ).filter((validation) => validation !== null);
    }

    private async handleGetBrokenContent(
        actor: SessionUser,
        projectUuid: string,
        input: Record<string, unknown>,
    ): Promise<string> {
        const validations: ValidationResponse[] = (
            await this.validationModel.get(projectUuid)
        ).filter(
            // Exclude advisory "unused field" warnings so Autopilot does not
            // remove valid fields or table calculations that are merely flagged
            // as unused. These are the only validations using ChartConfiguration.
            (validation) =>
                validation.errorType !== ValidationErrorType.ChartConfiguration,
        );

        // Detail mode: full item list for one root-cause model. Scoping by
        // model keeps every item reachable without raising the global cap.
        const tableNameFilter =
            typeof input.table_name === 'string' && input.table_name.length > 0
                ? input.table_name
                : undefined;
        if (tableNameFilter) {
            const matching = validations.filter(
                (validation) =>
                    getValidationRootCauseTableName(validation) ===
                    tableNameFilter,
            );
            const visibleValidations = await this.mapVisibleBrokenContentRows(
                actor,
                projectUuid,
                matching,
            );
            return formatManagedAgentToolListResult(
                summarizeManagedAgentBrokenContent(visibleValidations),
                getManagedAgentToolResultLimit(
                    input.limit,
                    MANAGED_AGENT_TOOL_RESULT_ITEM_LIMIT,
                ),
            );
        }

        // Summary mode: EVERY root-cause group with complete counts (never
        // truncated), plus a capped sample of affected content per group
        const summary =
            ValidationService.groupValidationsByRootCause(validations);
        const { canViewChartUuid, canViewDashboardUuid } =
            this.createContentVisibilityChecker(actor, projectUuid);

        const groups = await Promise.all(
            summary.groups.map(async (group) => {
                const visibleContent = (
                    await Promise.all(
                        group.affectedContent.map(async (content) => {
                            if (content.uuid === null) return null;
                            if (
                                content.source === ValidationSourceType.Chart &&
                                !(await canViewChartUuid(content.uuid))
                            ) {
                                return null;
                            }
                            if (
                                content.source ===
                                    ValidationSourceType.Dashboard &&
                                !(await canViewDashboardUuid(content.uuid))
                            ) {
                                return null;
                            }
                            return {
                                uuid: content.uuid,
                                name: content.name,
                                source: content.source,
                                views: content.views,
                                error_count: content.errorCount,
                            };
                        }),
                    )
                ).filter((content) => content !== null);

                const items = visibleContent.slice(
                    0,
                    MANAGED_AGENT_BROKEN_CONTENT_GROUP_ITEM_LIMIT,
                );
                const totalItems =
                    group.affectedCharts +
                    group.affectedDashboards +
                    group.affectedTables +
                    group.affectedDataApps;
                return {
                    group_key: group.groupKey,
                    error_type: group.errorType,
                    table_name: group.tableName,
                    field_name: group.fieldName,
                    error_count: group.errorCount,
                    affected_charts: group.affectedCharts,
                    affected_dashboards: group.affectedDashboards,
                    affected_tables: group.affectedTables,
                    affected_data_apps: group.affectedDataApps,
                    sample_error: group.sampleError,
                    items,
                    items_truncated: items.length < totalItems,
                };
            }),
        );

        return JSON.stringify({
            total_errors: summary.totalErrors,
            total_affected_items: summary.totalAffectedItems,
            groups,
            note: 'This is the COMPLETE set of validation error groups. To list every affected item for one group, call get_broken_content again with table_name set to that group. Counts include content outside your visibility scope; items only list content you can act on.',
        });
    }

    private async handleGetPreviewProjects(
        actor: SessionUser,
        projectUuid: string,
    ): Promise<string> {
        const project = await this.projectModel.get(projectUuid);
        // Only return preview projects that were copied from THIS project,
        // not all preview projects across the organization.
        const allProjects = await this.projectModel.getAllByOrganizationUuid(
            project.organizationUuid,
        );
        const policy = await this.getPolicy(projectUuid);
        const previewCutoff = new Date();
        previewCutoff.setDate(
            previewCutoff.getDate() - policy.previewProjectDays,
        );

        const oldPreviews = allProjects.filter(
            (p) =>
                p.type === ProjectType.PREVIEW &&
                p.upstreamProjectUuid === projectUuid &&
                new Date(p.createdAt) < previewCutoff,
        );
        const visiblePreviews = (
            await Promise.all(
                oldPreviews.map(async (preview) =>
                    (await this.canActorViewProject(actor, preview.projectUuid))
                        ? preview
                        : null,
                ),
            )
        )
            .filter((preview) => preview !== null)
            .sort(
                (a, b) =>
                    new Date(a.createdAt).getTime() -
                    new Date(b.createdAt).getTime(),
            );

        return formatManagedAgentToolListResult(
            visiblePreviews.map((p) => ({
                uuid: p.projectUuid,
                name: p.name,
                created_at: p.createdAt,
            })),
        );
    }

    private async handleGetPopularContent(
        actor: SessionUser,
        projectUuid: string,
    ): Promise<string> {
        const [spaces, excludedSpaces] = await Promise.all([
            this.spaceModel.find({ projectUuid }),
            this.getExcludedSpaceUuids(projectUuid),
        ]);
        const inScopeSpaces = spaces.filter(
            (space) => !excludedSpaces.has(space.uuid),
        );
        const spaceUuids =
            await this.spacePermissionService.getAccessibleSpaceUuids(
                'view',
                actor,
                inScopeSpaces.map((space) => space.uuid),
            );
        if (spaceUuids.length === 0) {
            return JSON.stringify([]);
        }
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

        return formatManagedAgentToolListResult(
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
        actor: SessionUser,
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
        if (!(await this.canActorViewChart(actor, chart))) {
            throw new ForbiddenError(
                `Autopilot actor cannot view chart ${chartUuid}`,
            );
        }
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
        actor: SessionUser,
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

        const fixProtectionBlock = await this.checkTargetProtectionGuard(
            projectUuid,
            ManagedAgentTargetType.CHART,
            chartUuid,
            chartName,
            { actor, sessionId, runUuid, attemptedAction: 'fix' },
        );
        if (fixProtectionBlock) {
            return fixProtectionBlock;
        }

        // Get the current chart and verify it belongs to this project
        const chart = await this.savedChartModel.get(chartUuid);
        ManagedAgentService.assertProjectOwnership(
            chart.projectUuid,
            projectUuid,
            'Chart',
            chartUuid,
        );
        await this.assertActorCanManageProject(actor, projectUuid);
        await this.assertActorCanUpdateChart(actor, chart);

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
            actor,
        );

        // Clear stale validation errors for this chart — the fix should resolve them.
        // If the fix was incomplete, the next validateProject run will re-create them.
        await this.validationModel.deleteChartValidations(
            chartUuid,
            projectUuid,
        );

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
        this.trackActionCreated(actor, runUuid, action);

        return JSON.stringify({
            action_uuid: action.actionUuid,
            fixed: true,
        });
    }

    private async findAgentSpace(projectUuid: string) {
        const [space] = await this.spaceModel.find({
            projectUuid,
            slug: AGENT_SUGGESTIONS_SPACE_SLUG,
        });
        return space ?? null;
    }

    /**
     * Once the suggestions space exists its own permissions are the source of
     * truth — admins edit them in the space access modal — so the stored
     * audience policy only seeds the space when it is first created.
     */
    private async resolveSuggestionsAudience(
        projectUuid: string,
        storedAudience: ManagedAgentAudience,
    ): Promise<ManagedAgentAudience> {
        const space = await this.findAgentSpace(projectUuid);
        if (!space) return storedAudience;
        return space.inheritParentPermissions ? 'everyone' : 'admins';
    }

    private async getOrCreateAgentSpace(
        actor: SessionUser,
        projectUuid: string,
    ): Promise<string> {
        const existingSpace = await this.findAgentSpace(projectUuid);
        if (existingSpace) {
            return existingSpace.uuid;
        }
        await this.assertActorCanCreateSpace(
            actor,
            projectUuid,
            'Agent Suggestions',
        );

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

        // Audience 'admins' keeps the space restricted to its admin creator
        const audience =
            settings?.policy.audience ?? DEFAULT_MANAGED_AGENT_POLICY.audience;
        const space = await this.spaceModel.createSpace(
            {
                name: 'Agent Suggestions',
                inheritParentPermissions: audience !== 'admins',
                parentSpaceUuid: null,
            },
            { projectUuid, userId },
        );
        return space.uuid;
    }

    private async handleCreateContent(
        actor: SessionUser,
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
        await this.assertActorCanManageProject(actor, projectUuid);
        const spaceUuid = await this.getOrCreateAgentSpace(actor, projectUuid);
        await this.assertActorCanCreateChart(
            actor,
            projectUuid,
            spaceUuid,
            chartName,
        );

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
        this.trackActionCreated(actor, runUuid, action);

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
        actor: SessionUser,
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

        const policy = await this.getPolicy(projectUuid);
        if (policy.aggression === 'observe') {
            return JSON.stringify({
                error: 'Flagging is disabled by project policy (observe mode). Use log_insight instead.',
                blocked: true,
            });
        }

        const targetType = ManagedAgentService.validateEnum(
            input.target_type,
            ManagedAgentTargetType,
            'target_type',
        );
        const flagProtectionBlock = await this.checkTargetProtectionGuard(
            projectUuid,
            targetType,
            targetUuid,
            targetName,
            { actor, sessionId, runUuid, attemptedAction: 'flag' },
        );
        if (flagProtectionBlock) {
            return flagProtectionBlock;
        }
        if (
            !(await this.canActorViewTarget(
                actor,
                projectUuid,
                targetType,
                targetUuid,
            ))
        ) {
            throw new ForbiddenError(
                `Autopilot actor cannot view ${targetType} ${targetUuid}`,
            );
        }

        // Flags on deleted content are pointless: refuse instead of
        // recording an action nobody can act on
        if (
            targetType === ManagedAgentTargetType.CHART ||
            targetType === ManagedAgentTargetType.DASHBOARD
        ) {
            try {
                if (targetType === ManagedAgentTargetType.CHART) {
                    await this.savedChartModel.get(targetUuid);
                } else {
                    await this.dashboardModel.getByIdOrSlug(targetUuid);
                }
            } catch {
                return JSON.stringify({
                    skipped: true,
                    note: `"${targetName}" no longer exists (deleted); no flag was created.`,
                });
            }
        }

        // Idempotency: re-flagging an actively flagged target would reset the
        // escalation clock and duplicate the activity feed, so report the
        // existing flag instead of creating a new action
        const existingFlaggedAt =
            await this.managedAgentModel.findLatestActiveFlagCreatedAt(
                projectUuid,
                targetUuid,
            );
        if (existingFlaggedAt) {
            return JSON.stringify({
                already_flagged: true,
                flagged_at: existingFlaggedAt.toISOString(),
                note: 'This target already carries an active flag; no new action was created. Once the flag is older than the escalation window it becomes eligible for soft_delete_content.',
            });
        }

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
        this.trackActionCreated(actor, runUuid, action);
        return JSON.stringify({ action_uuid: action.actionUuid });
    }

    // Code-enforced escalation: content may only be deleted after carrying an
    // unreversed flag for the policy's escalation window. Callers that target
    // provably dead content (bulk deleted-model cleanup) opt out of the
    // flag-first requirement for never-viewed items via flagFirstAlways=false.
    private async checkEscalationGuard(
        projectUuid: string,
        targetType: ManagedAgentTargetType,
        targetUuid: string,
        targetName: string,
        policy: ManagedAgentPolicy,
        options: {
            // Individual soft-deletes require a prior flag for ALL content.
            // Bulk deletion of charts on deleted models keeps the viewed-only
            // gate: that content is provably dead, and flag-first there would
            // defeat the automatable cleanup.
            flagFirstAlways: boolean;
        },
    ): Promise<string | null> {
        if (!options.flagFirstAlways) {
            const lastViewed =
                targetType === ManagedAgentTargetType.CHART
                    ? (
                          await this.analyticsModel.getLastViewedAtForCharts([
                              targetUuid,
                          ])
                      ).get(targetUuid)
                    : (
                          await this.analyticsModel.getLastViewedAtForDashboards(
                              [targetUuid],
                          )
                      ).get(targetUuid);
            if (!lastViewed) {
                return null;
            }
        }
        const flaggedAt =
            await this.managedAgentModel.findLatestActiveFlagCreatedAt(
                projectUuid,
                targetUuid,
            );
        if (!flaggedAt) {
            return JSON.stringify({
                error: `"${targetName}" must be flagged first and stay flagged for ${policy.escalationHours}+ hours before soft-deleting. Use flag_content instead.`,
                blocked: true,
            });
        }
        const escalationMs = policy.escalationHours * 60 * 60 * 1000;
        if (Date.now() - flaggedAt.getTime() < escalationMs) {
            return JSON.stringify({
                error: `"${targetName}" was flagged less than ${policy.escalationHours} hours ago. Wait for the escalation window before soft-deleting.`,
                blocked: true,
            });
        }
        return null;
    }

    // Full chart soft-delete guard chain shared by soft_delete_content and
    // bulk_delete_broken_content. Returns a blocked JSON payload, or null
    // after a successful soft delete.
    private async guardAndSoftDeleteChart(args: {
        actor: SessionUser;
        projectUuid: string;
        sessionId: string;
        runUuid: string;
        chartUuid: string;
        chartName: string;
        policy: ManagedAgentPolicy;
        actorUuid: string;
        attemptedAction: 'fix' | 'flag' | 'soft-delete';
        flagFirstAlways: boolean;
    }): Promise<string | null> {
        const {
            actor,
            projectUuid,
            sessionId,
            runUuid,
            chartUuid,
            chartName,
            policy,
            actorUuid,
            attemptedAction,
            flagFirstAlways,
        } = args;

        const deleteProtectionBlock = await this.checkTargetProtectionGuard(
            projectUuid,
            ManagedAgentTargetType.CHART,
            chartUuid,
            chartName,
            { actor, sessionId, runUuid, attemptedAction },
        );
        if (deleteProtectionBlock) {
            return deleteProtectionBlock;
        }

        const protectCutoff = new Date();
        protectCutoff.setDate(
            protectCutoff.getDate() - policy.protectRecentDays,
        );

        const chart = await this.savedChartModel.get(chartUuid);
        ManagedAgentService.assertProjectOwnership(
            chart.projectUuid,
            projectUuid,
            'Chart',
            chartUuid,
        );
        await this.assertActorCanDeleteChart(actor, chart);
        // Hard guardrail: never delete agent-created charts
        if (chart.slug?.startsWith('agent-')) {
            return JSON.stringify({
                error: `Chart "${chartName}" was created by the agent (slug: ${chart.slug}). Cannot soft-delete own content.`,
                blocked: true,
            });
        }
        // Hard guardrail: never delete recently created or edited charts
        const chartModifiedAt =
            await this.managedAgentModel.getChartLastModifiedAt(chartUuid);
        if (chartModifiedAt && chartModifiedAt > protectCutoff) {
            return JSON.stringify({
                error: `Chart "${chartName}" was created or last edited on ${chartModifiedAt.toISOString().split('T')[0]}, less than ${policy.protectRecentDays} days ago. Cannot soft-delete recently touched content.`,
                blocked: true,
            });
        }
        const chartEscalationBlock = await this.checkEscalationGuard(
            projectUuid,
            ManagedAgentTargetType.CHART,
            chartUuid,
            chartName,
            policy,
            { flagFirstAlways },
        );
        if (chartEscalationBlock) {
            return chartEscalationBlock;
        }
        await this.savedChartModel.softDelete(chartUuid, actorUuid);
        // Clear the chart's validation errors so the Validator updates
        // without waiting for the next validation run
        await this.validationModel.deleteChartValidations(
            chartUuid,
            projectUuid,
        );
        return null;
    }

    private async handleSoftDelete(
        actor: SessionUser,
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
        await this.assertActorCanManageProject(actor, projectUuid);

        // Use the admin who enabled the agent as the actor
        const settings = await this.managedAgentModel.getSettings(projectUuid);
        const actorUuid = settings?.enabledByUserUuid ?? projectUuid;
        const policy = settings?.policy ?? DEFAULT_MANAGED_AGENT_POLICY;

        // Hard guardrail: aggression below 'cleanup' never deletes
        if (policy.aggression !== 'cleanup') {
            return JSON.stringify({
                error: `Soft-delete is disabled by project policy (cleanup mode: ${policy.aggression}). Flag or log an insight instead.`,
                blocked: true,
            });
        }

        // Per-run blast-radius cap so a first run on a low-traffic project
        // cannot sweep everything in one pass
        const deletedThisRun =
            await this.managedAgentModel.countNonBulkSoftDeletesForRun(runUuid);
        if (deletedThisRun >= MANAGED_AGENT_SOFT_DELETE_RUN_LIMIT) {
            return JSON.stringify({
                error: `Soft-delete run cap reached (${MANAGED_AGENT_SOFT_DELETE_RUN_LIMIT} per run). Flag remaining candidates instead and mention the backlog in your summary; the next run can continue the cleanup.`,
                blocked: true,
            });
        }

        // Verify entity exists, belongs to this project, and apply guardrails
        if (targetType === ManagedAgentTargetType.CHART) {
            const chartBlock = await this.guardAndSoftDeleteChart({
                actor,
                projectUuid,
                sessionId,
                runUuid,
                chartUuid: targetUuid,
                chartName: targetName,
                policy,
                actorUuid,
                attemptedAction: 'soft-delete',
                flagFirstAlways: true,
            });
            if (chartBlock) {
                return chartBlock;
            }
        } else if (targetType === ManagedAgentTargetType.DASHBOARD) {
            const deleteProtectionBlock = await this.checkTargetProtectionGuard(
                projectUuid,
                targetType,
                targetUuid,
                targetName,
                { actor, sessionId, runUuid, attemptedAction: 'soft-delete' },
            );
            if (deleteProtectionBlock) {
                return deleteProtectionBlock;
            }

            const protectCutoff = new Date();
            protectCutoff.setDate(
                protectCutoff.getDate() - policy.protectRecentDays,
            );
            const dashboard =
                await this.dashboardModel.getByIdOrSlug(targetUuid);
            ManagedAgentService.assertProjectOwnership(
                dashboard.projectUuid,
                projectUuid,
                'Dashboard',
                targetUuid,
            );
            await this.assertActorCanDeleteDashboard(actor, dashboard);
            // Hard guardrail: never delete recently created or edited dashboards
            const dashModifiedAt =
                await this.managedAgentModel.getDashboardLastModifiedAt(
                    targetUuid,
                );
            if (dashModifiedAt && dashModifiedAt > protectCutoff) {
                return JSON.stringify({
                    error: `Dashboard "${targetName}" was created or last edited on ${dashModifiedAt.toISOString().split('T')[0]}, less than ${policy.protectRecentDays} days ago. Cannot soft-delete recently touched content.`,
                    blocked: true,
                });
            }
            const dashEscalationBlock = await this.checkEscalationGuard(
                projectUuid,
                targetType,
                targetUuid,
                targetName,
                policy,
                { flagFirstAlways: true },
            );
            if (dashEscalationBlock) {
                return dashEscalationBlock;
            }
            await this.dashboardModel.softDelete(targetUuid, actorUuid);
            // Clear the dashboard's validation errors so the Validator
            // updates without waiting for the next validation run
            await this.validationModel.deleteDashboardValidations(
                targetUuid,
                projectUuid,
            );
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
        this.trackActionCreated(actor, runUuid, action);
        return JSON.stringify({
            action_uuid: action.actionUuid,
            recoverable: true,
        });
    }

    private async handleBulkDeleteBrokenContent(
        actor: SessionUser,
        projectUuid: string,
        sessionId: string,
        runUuid: string,
        input: Record<string, unknown>,
    ): Promise<string> {
        const tableName = input.table_name as string;
        const reason = input.reason as string;
        if (!tableName || !reason) {
            throw new Error('table_name and reason are required');
        }

        await this.assertActorCanManageProject(actor, projectUuid);
        const settings = await this.managedAgentModel.getSettings(projectUuid);
        const actorUuid = settings?.enabledByUserUuid ?? projectUuid;
        const policy = settings?.policy ?? DEFAULT_MANAGED_AGENT_POLICY;

        // Hard guardrail: aggression below 'cleanup' never deletes
        if (policy.aggression !== 'cleanup') {
            return JSON.stringify({
                error: `Bulk delete is disabled by project policy (cleanup mode: ${policy.aggression}). Flag or log an insight instead.`,
                blocked: true,
            });
        }

        // Candidates: charts whose whole model is gone. Dashboards referencing
        // the model are never bulk-deleted; they usually have healthy tiles
        const validations = await this.validationModel.get(projectUuid);
        const candidates = new Map<string, string>();
        validations.forEach((validation) => {
            if (
                validation.source === ValidationSourceType.Chart &&
                validation.errorType === ValidationErrorType.Model &&
                'chartUuid' in validation &&
                validation.chartUuid &&
                getValidationRootCauseTableName(validation) === tableName
            ) {
                candidates.set(validation.chartUuid, validation.name);
            }
        });

        if (candidates.size === 0) {
            return JSON.stringify({
                error: `No charts with a model-level validation error were found for model '${tableName}'. Run get_broken_content to see current groups.`,
            });
        }

        const entries = [...candidates.entries()];
        const toProcess = entries.slice(0, MANAGED_AGENT_BULK_DELETE_RUN_LIMIT);
        const remaining = entries.length - toProcess.length;

        const deleted: { uuid: string; name: string; action_uuid: string }[] =
            [];
        const blocked: { uuid: string; name: string; reason: string }[] = [];

        // Sequential on purpose: each delete runs the full guard chain and
        // writes an action row
        for (const [chartUuid, chartName] of toProcess) {
            // eslint-disable-next-line no-await-in-loop
            const chart = await this.savedChartModel.get(chartUuid);
            // Defense against stale validation rows: the chart must still
            // reference the deleted model
            if (chart.tableName !== tableName) {
                blocked.push({
                    uuid: chartUuid,
                    name: chartName,
                    reason: `Chart no longer references model '${tableName}'`,
                });
            } else {
                // eslint-disable-next-line no-await-in-loop
                const chartBlock = await this.guardAndSoftDeleteChart({
                    actor,
                    projectUuid,
                    sessionId,
                    runUuid,
                    chartUuid,
                    chartName,
                    policy,
                    actorUuid,
                    attemptedAction: 'soft-delete',
                    flagFirstAlways: false,
                });
                if (chartBlock) {
                    let blockReason = chartBlock;
                    try {
                        const parsed: unknown = JSON.parse(chartBlock);
                        if (
                            parsed !== null &&
                            typeof parsed === 'object' &&
                            'error' in parsed &&
                            typeof parsed.error === 'string'
                        ) {
                            blockReason = parsed.error;
                        }
                    } catch {
                        // keep the raw payload as the reason
                    }
                    blocked.push({
                        uuid: chartUuid,
                        name: chartName,
                        reason: blockReason,
                    });
                } else {
                    // eslint-disable-next-line no-await-in-loop
                    const action = await this.managedAgentModel.createAction({
                        projectUuid,
                        sessionId,
                        managedAgentRunUuid: runUuid,
                        actionType: ManagedAgentActionType.SOFT_DELETED,
                        targetType: ManagedAgentTargetType.CHART,
                        targetUuid: chartUuid,
                        targetName: chartName,
                        description: reason,
                        metadata: {
                            bulk: true,
                            table_name: tableName,
                            reason,
                        },
                    });
                    this.trackActionCreated(actor, runUuid, action);
                    deleted.push({
                        uuid: chartUuid,
                        name: chartName,
                        action_uuid: action.actionUuid,
                    });
                }
            }
        }

        return JSON.stringify({
            deleted_count: deleted.length,
            deleted,
            blocked,
            remaining,
            recoverable: true,
            note:
                remaining > 0
                    ? `Run cap reached: ${remaining} more broken charts remain for model '${tableName}'. They will be picked up on the next run.`
                    : undefined,
        });
    }

    private async handleLogInsight(
        actor: SessionUser,
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
        if (
            !(await this.canActorViewTarget(
                actor,
                projectUuid,
                targetType,
                targetUuid,
            ))
        ) {
            throw new ForbiddenError(
                `Autopilot actor cannot view ${targetType} ${targetUuid}`,
            );
        }

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
        this.trackActionCreated(actor, runUuid, action);
        return JSON.stringify({ action_uuid: action.actionUuid });
    }

    private async handleGetUserQuestions(
        _actor: SessionUser,
        projectUuid: string,
        input: Record<string, unknown>,
    ): Promise<string> {
        const limit = getManagedAgentToolResultLimit(input.limit, 30);
        const days = (input.days as number) ?? 30;

        const questions = await this.managedAgentModel.getUserQuestions(
            projectUuid,
            days,
            limit,
        );

        return formatManagedAgentToolListResult(
            questions.map((q) => ({
                question: q.prompt,
                asked_by: q.userName,
                asked_at: q.createdAt,
            })),
        );
    }

    private async handleGetSlowQueries(
        actor: SessionUser,
        projectUuid: string,
        input: Record<string, unknown>,
    ): Promise<string> {
        const policy = await this.getPolicy(projectUuid);
        const thresholdMs =
            (input.threshold_ms as number) ?? policy.slowQueryThresholdMs;
        const limit = getManagedAgentToolResultLimit(input.limit, 20);

        const slowQueries = await this.managedAgentModel.getSlowQueries(
            projectUuid,
            thresholdMs,
            limit,
        );
        const { canViewChartUuid, canViewDashboardUuid } =
            this.createContentVisibilityChecker(actor, projectUuid);

        const visibleQueries = (
            await Promise.all(
                slowQueries.map(async (query) => {
                    if (query.chartUuid) {
                        return (await canViewChartUuid(query.chartUuid))
                            ? query
                            : null;
                    }
                    if (query.dashboardUuid) {
                        return (await canViewDashboardUuid(query.dashboardUuid))
                            ? query
                            : null;
                    }
                    return query;
                }),
            )
        ).filter((query) => query !== null);

        return formatManagedAgentToolListResult(
            visibleQueries.map((q) => ({
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

    private static readonly DEFAULT_INACTIVE_USER_DAYS = 90;

    private async handleGetInactiveUsers(
        projectUuid: string,
        input: Record<string, unknown>,
    ): Promise<string> {
        const inactiveDays =
            (input.inactive_days as number) ??
            ManagedAgentService.DEFAULT_INACTIVE_USER_DAYS;
        const limit = getManagedAgentToolResultLimit(input.limit, 30);

        // Org comes from the project, never the actor: membership drives who
        // counts as a member, and the wrong org would silently change the set.
        const { organizationUuid } =
            await this.projectModel.getSummary(projectUuid);
        const users = await this.managedAgentModel.getInactiveUsers(
            projectUuid,
            organizationUuid,
            inactiveDays,
            limit,
        );

        return formatManagedAgentToolListResult(
            users.map((user) => ({
                user_uuid: user.userUuid,
                name: user.userName,
                email: user.email,
                role: user.role,
                last_active_at: user.lastActiveAt,
                last_active_source: user.lastActiveSource,
                inactive_days_threshold: inactiveDays,
            })),
        );
    }

    private async handleGetOrphanedContent(
        actor: SessionUser,
        projectUuid: string,
        input: Record<string, unknown>,
    ): Promise<string> {
        const limit = getManagedAgentToolResultLimit(input.limit, 30);

        // Org comes from the project, never the actor: a mismatched org makes
        // every current member look like they left, orphaning the whole project.
        const { organizationUuid } =
            await this.projectModel.getSummary(projectUuid);
        const orphaned = await this.managedAgentModel.getOrphanedContent(
            projectUuid,
            organizationUuid,
            limit,
        );
        const { canViewChartUuid, canViewDashboardUuid } =
            this.createContentVisibilityChecker(actor, projectUuid);

        const visible = (
            await Promise.all(
                orphaned.map(async (item) => {
                    const canView =
                        item.contentType === 'chart'
                            ? await canViewChartUuid(item.contentUuid)
                            : await canViewDashboardUuid(item.contentUuid);
                    return canView ? item : null;
                }),
            )
        ).filter((item) => item !== null);

        return formatManagedAgentToolListResult(
            visible.map((item) => ({
                content_type: item.contentType,
                content_uuid: item.contentUuid,
                content_name: item.contentName,
                space_uuid: item.spaceUuid,
                owner_uuid: item.ownerUserUuid,
                owner_name: item.ownerName,
                owner_status: item.ownerStatus,
                last_viewed_at: item.lastViewedAt,
            })),
        );
    }

    private static readonly DEFAULT_UNUSED_AGENT_WINDOW_DAYS = 30;

    private static readonly DEFAULT_UNUSED_AGENT_MIN_PROMPTS = 5;

    private async handleGetUnusedAgents(
        projectUuid: string,
        input: Record<string, unknown>,
    ): Promise<string> {
        const windowDays =
            (input.window_days as number) ??
            ManagedAgentService.DEFAULT_UNUSED_AGENT_WINDOW_DAYS;
        const minPrompts =
            (input.min_prompts as number) ??
            ManagedAgentService.DEFAULT_UNUSED_AGENT_MIN_PROMPTS;
        const limit = getManagedAgentToolResultLimit(input.limit, 30);

        // Org comes from the project: the router is org-scoped, and the wrong
        // org would report every agent as unrouted.
        const { organizationUuid } =
            await this.projectModel.getSummary(projectUuid);
        const agents = await this.managedAgentModel.getUnusedAgents(
            projectUuid,
            organizationUuid,
            windowDays,
            minPrompts,
            limit,
        );

        return formatManagedAgentToolListResult(
            agents.map((agent) => ({
                agent_uuid: agent.agentUuid,
                name: agent.agentName,
                created_at: agent.createdAt,
                admin_only: agent.adminOnly,
                reason: agent.reason,
                routing_signal: agent.routingSignal,
                last_used_at: agent.lastUsedAt,
                threads_total: agent.totalThreads,
                threads_in_window: agent.recentThreads,
                prompts_total: agent.totalPrompts,
                prompts_in_window: agent.recentPrompts,
                answered_prompts_in_window: agent.recentAnswered,
                distinct_askers_in_window: agent.recentAskers,
                router_candidate_count: agent.routedCandidateCount,
                router_suggested_count: agent.routedSuggestedCount,
                router_chosen_count: agent.routedChosenCount,
                window_days: windowDays,
                min_prompts_threshold: minPrompts,
            })),
        );
    }

    private static readonly DEFAULT_PREAGG_WINDOW_DAYS = 30;

    private static readonly DEFAULT_PREAGG_MIN_QUERIES = 10;

    // Wide enough that one dominant non-additive metric cannot crowd every
    // additive shape out of the sample.
    private static readonly PREAGG_SHAPES_PER_EXPLORE = 10;

    private async handleGetPreAggCandidates(
        projectUuid: string,
        input: Record<string, unknown>,
    ): Promise<string> {
        if (!this.lightdashConfig.preAggregates.enabled) {
            return JSON.stringify({
                enabled: false,
                message:
                    'Pre-aggregates are not enabled on this instance, so there is nothing to check.',
            });
        }

        const windowDays =
            (input.window_days as number) ??
            ManagedAgentService.DEFAULT_PREAGG_WINDOW_DAYS;
        const minQueries =
            (input.min_queries as number) ??
            ManagedAgentService.DEFAULT_PREAGG_MIN_QUERIES;
        const limit = getManagedAgentToolResultLimit(input.limit, 10);

        const candidates =
            await this.managedAgentModel.getPreAggCandidateExplores(
                projectUuid,
                windowDays,
                minQueries,
                limit,
            );
        if (candidates.length === 0) {
            return formatManagedAgentToolListResult([]);
        }

        const exploreNames = candidates.map((c) => c.exploreName);
        const [shapes, missStats, explores] = await Promise.all([
            this.managedAgentModel.getPreAggQueryShapes(
                projectUuid,
                exploreNames,
                windowDays,
                ManagedAgentService.PREAGG_SHAPES_PER_EXPLORE,
            ),
            this.managedAgentModel.getPreAggMissStats(projectUuid, windowDays),
            this.projectModel.findExploresFromCache(
                projectUuid,
                'name',
                exploreNames,
            ),
        ]);

        const results = candidates.map((candidate) => {
            const exploreShapes = shapes.filter(
                (shape) => shape.exploreName === candidate.exploreName,
            );
            const exploreMissStats = missStats.filter(
                (stat) => stat.exploreName === candidate.exploreName,
            );
            const explore = explores[candidate.exploreName];
            const suggestion =
                explore && !('errors' in explore)
                    ? buildPreAggCandidateSuggestion({
                          explore,
                          shapes: exploreShapes.map((shape) => ({
                              dimensionFieldIds: shape.dimensionFieldIds,
                              metricFieldIds: shape.metricFieldIds,
                              filterFieldIds: shape.filterFieldIds,
                              hasCustomFields: shape.hasCustomFields,
                              queryCount: shape.queryCount,
                          })),
                      })
                    : null;

            return {
                explore_name: candidate.exploreName,
                query_count: candidate.queryCount,
                distinct_users: candidate.distinctUsers,
                total_warehouse_ms: candidate.totalExecutionMs,
                avg_warehouse_ms: candidate.avgExecutionMs,
                p95_warehouse_ms: candidate.p95ExecutionMs,
                queries_already_served_by_preagg: candidate.preAggHitCount,
                query_contexts: candidate.contextCounts,
                preagg_hits_in_window: exploreMissStats.reduce(
                    (sum, stat) => sum + stat.hitCount,
                    0,
                ),
                preagg_misses_by_reason: exploreMissStats
                    .filter((stat) => stat.missReason !== null)
                    .map((stat) => ({
                        reason: stat.missReason,
                        miss_count: stat.missCount,
                    })),
                top_query_shapes: exploreShapes.map((shape) => ({
                    dimensions: shape.dimensionFieldIds,
                    metrics: shape.metricFieldIds,
                    filter_fields: shape.filterFieldIds,
                    uses_custom_fields: shape.hasCustomFields,
                    query_count: shape.queryCount,
                    avg_warehouse_ms: shape.avgExecutionMs,
                })),
                suggestion: suggestion
                    ? {
                          suggested_yaml: suggestion.suggestedYaml,
                          no_suggestion_reason: suggestion.noSuggestionReason,
                          time_dimension: suggestion.timeDimension,
                          granularity: suggestion.granularity,
                          covered_query_count: suggestion.coveredQueryCount,
                          coverable_query_count: suggestion.coverableQueryCount,
                          custom_field_query_count:
                              suggestion.customFieldQueryCount,
                          ineligible_fields: suggestion.ineligibleFields.map(
                              (field) => ({
                                  field_id: field.fieldId,
                                  kind: field.kind,
                                  reason: field.reason,
                              }),
                          ),
                          unresolved_field_ids: suggestion.unresolvedFieldIds,
                      }
                    : {
                          suggested_yaml: null,
                          no_suggestion_reason:
                              'explore_not_found_or_has_compile_errors',
                      },
            };
        });

        return JSON.stringify({
            window_days: windowDays,
            min_queries_threshold: minQueries,
            ...buildManagedAgentToolListResult(results, limit),
        });
    }

    private async handleReverseOwnAction(
        actor: SessionUser,
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
        await this.assertActorCanManageProject(actor, projectUuid);

        // Perform the reversal
        switch (action.actionType) {
            case ManagedAgentActionType.SOFT_DELETED:
                if (action.targetType === ManagedAgentTargetType.CHART) {
                    const chart = await this.savedChartModel.get(
                        action.targetUuid,
                        undefined,
                        { deleted: true },
                    );
                    await this.assertActorCanRestoreChart(actor, chart);
                    await this.savedChartModel.restore(action.targetUuid);
                } else if (
                    action.targetType === ManagedAgentTargetType.DASHBOARD
                ) {
                    const dashboard = await this.dashboardModel.getByIdOrSlug(
                        action.targetUuid,
                        { deleted: true },
                    );
                    await this.assertActorCanRestoreDashboard(actor, dashboard);
                    await this.dashboardModel.restore(action.targetUuid);
                }
                break;
            case ManagedAgentActionType.CREATED_CONTENT:
                if (action.targetType === ManagedAgentTargetType.CHART) {
                    const chart = await this.savedChartModel.get(
                        action.targetUuid,
                        undefined,
                        { deleted: 'any' },
                    );
                    await this.assertActorCanDeleteChart(actor, chart);
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
