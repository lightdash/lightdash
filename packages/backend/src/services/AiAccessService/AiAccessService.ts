import { subject } from '@casl/ability';
import {
    AgentIdentityConnectEntryPoint,
    AgentIdentityConnectFailureReason,
    AI_AGENT_APPLICATION_NAME,
    AI_AGENT_TAG,
    AI_PRINCIPAL_QUERY_TAG,
    AiAccessRefusalAction,
    AiAccessRefusalReason,
    AiAccessRefusedError,
    AiAgentMarkerLevel,
    assertIsAccountWithOrg,
    assertUnreachable,
    FeatureFlags,
    FeatureNotEnabledError,
    ForbiddenError,
    getAgentIdentityWarehouseTypes,
    isAiAccessQueryContext,
    isAllowedAgentIdentitySource,
    ParameterError,
    QueryExecutionContext,
    QueryHistoryStatus,
    QuerySurface,
    UnexpectedServerError,
    WarehouseTypes,
    type Account,
    type AiAccessForUser,
    type AiExecutionPlan,
    type AiMarkerTestResult,
    type AiWarehouseCapabilities,
    type CreateWarehouseCredentials,
    type OrganizationAgentIdentityOverview,
    type OrganizationAgentIdentityRule,
    type OrganizationAgentIdentitySettings,
    type QueryHistory,
    type SessionUser,
    type UpdateOrganizationAgentIdentityRule,
} from '@lightdash/common';
import { validate as isUuid } from 'uuid';
import {
    LightdashAnalytics,
    type AgentIdentityConnectProperties,
} from '../../analytics/LightdashAnalytics';
import { trackSafely } from '../../analytics/trackSafely';
import { type LightdashConfig } from '../../config/parseConfig';
import { type FeatureFlagModel } from '../../models/FeatureFlagModel/FeatureFlagModel';
import { type OrganizationAgentIdentityRulesModel } from '../../models/OrganizationAgentIdentityRulesModel';
import { type OrganizationAgentIdentitySettingsModel } from '../../models/OrganizationAgentIdentitySettingsModel';
import { type ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { type QueryHistoryModel } from '../../models/QueryHistoryModel/QueryHistoryModel';
import { type UserModel } from '../../models/UserModel';
import { type UserWarehouseCredentialsModel } from '../../models/UserWarehouseCredentials/UserWarehouseCredentialsModel';
import { type WarehouseConnectionModel } from '../../models/WarehouseConnectionModel/WarehouseConnectionModel';
import { BaseService } from '../BaseService';
import { describeAgentMarker } from './agentMarker';
import { agentMarkerProbe } from './agentMarkerProbe';
import { type AiCredentialProvider } from './providers/AiCredentialProvider';
import { type AiCredentialProviderRegistry } from './providers/registry';

export type AgentConnectAttempt = Omit<
    AgentIdentityConnectProperties,
    'warehouseType'
>;

export type AiAccessEvaluation =
    | { kind: 'query'; surface: QuerySurface }
    | { kind: 'result_read' }
    | { kind: 'diagnostic' };

export type ResolvePlanArgs = {
    evaluation: AiAccessEvaluation;
    projectUuid: string;
    organizationUuid: string;
    warehouseConnectionUuid: string | null;
    connection: CreateWarehouseCredentials;
    context: QueryExecutionContext;
    userUuid: string;
    isRegisteredUser: boolean;
    isServiceAccount: boolean;
};

type AccessArgs = Omit<ResolvePlanArgs, 'context' | 'evaluation'>;

type AiAccessServiceArguments = {
    analytics: Pick<LightdashAnalytics, 'track'>;
    organizationAgentIdentityRulesModel: OrganizationAgentIdentityRulesModel;
    organizationAgentIdentitySettingsModel: OrganizationAgentIdentitySettingsModel;
    lightdashConfig: LightdashConfig;
    featureFlagModel: FeatureFlagModel;
    projectModel: ProjectModel;
    queryHistoryModel: QueryHistoryModel;
    warehouseConnectionModel: WarehouseConnectionModel;
    userModel: UserModel;
    userWarehouseCredentialsModel: UserWarehouseCredentialsModel;
    providerRegistry: AiCredentialProviderRegistry;
};

export class AiAccessService extends BaseService {
    private readonly analytics: Pick<LightdashAnalytics, 'track'>;

    private readonly organizationAgentIdentityRulesModel: OrganizationAgentIdentityRulesModel;

    private readonly organizationAgentIdentitySettingsModel: OrganizationAgentIdentitySettingsModel;

    private readonly lightdashConfig: LightdashConfig;

    private readonly featureFlagModel: FeatureFlagModel;

    private readonly projectModel: ProjectModel;

    private readonly warehouseConnectionModel: WarehouseConnectionModel;

    private readonly queryHistoryModel: QueryHistoryModel;

    private readonly userModel: UserModel;

    private readonly userWarehouseCredentialsModel: UserWarehouseCredentialsModel;

    private readonly providerRegistry: AiCredentialProviderRegistry;

    constructor({
        analytics,
        organizationAgentIdentityRulesModel,
        organizationAgentIdentitySettingsModel,
        lightdashConfig,
        featureFlagModel,
        userModel,
        userWarehouseCredentialsModel,
        projectModel,
        queryHistoryModel,
        warehouseConnectionModel,
        providerRegistry,
    }: AiAccessServiceArguments) {
        super();
        this.analytics = analytics;
        this.organizationAgentIdentityRulesModel =
            organizationAgentIdentityRulesModel;
        this.organizationAgentIdentitySettingsModel =
            organizationAgentIdentitySettingsModel;
        this.lightdashConfig = lightdashConfig;
        this.featureFlagModel = featureFlagModel;
        this.userModel = userModel;
        this.userWarehouseCredentialsModel = userWarehouseCredentialsModel;
        this.projectModel = projectModel;
        this.queryHistoryModel = queryHistoryModel;
        this.warehouseConnectionModel = warehouseConnectionModel;
        this.providerRegistry = providerRegistry;
    }

    async assertFeatureEnabled(
        user: Pick<AccessArgs, 'userUuid' | 'organizationUuid'>,
    ): Promise<void> {
        if (!(await this.isEnabled(user))) {
            throw new FeatureNotEnabledError(FeatureFlags.AgentIdentity);
        }
    }

    async getAgentConnectPrompt(user: SessionUser): Promise<
        | {
              required: true;
              reason: 'needs_sign_in' | 'sign_in_expired';
              projectUuid: string;
          }
        | { required: false }
    > {
        const { organizationUuid, userUuid } = user;
        if (
            !organizationUuid ||
            !(await this.isEnabled({ organizationUuid, userUuid }))
        )
            return { required: false };
        const settings =
            await this.organizationAgentIdentitySettingsModel.get(
                organizationUuid,
            );
        if (!settings.requireVerifiedAgentSessions) return { required: false };
        const projects =
            await this.projectModel.getAllByOrganizationUuid(organizationUuid);
        const ability = this.createAuditedAbility(user);
        const project = projects.find(
            ({ projectUuid, warehouseType }) =>
                warehouseType === WarehouseTypes.SNOWFLAKE &&
                ability.can(
                    'view',
                    subject('Project', { organizationUuid, projectUuid }),
                ),
        );
        if (!project) return { required: false };
        const provider = this.providerRegistry(WarehouseTypes.SNOWFLAKE);
        if (!provider) return { required: false };
        const connection =
            await this.projectModel.getWarehouseCredentialsForBinding(
                project.projectUuid,
                { kind: 'connection', warehouseConnectionUuid: null },
            );
        const reason = await provider.missingPrerequisite({
            connection,
            person: { userUuid, email: user.email ?? '' },
        });
        if (
            reason === AiAccessRefusalReason.NEEDS_SIGN_IN ||
            reason === AiAccessRefusalReason.SIGN_IN_EXPIRED
        )
            return { required: true, reason, projectUuid: project.projectUuid };
        return { required: false };
    }

    async getOrganizationSettings(
        account: Account,
    ): Promise<OrganizationAgentIdentityOverview> {
        assertIsAccountWithOrg(account);
        await this.assertFeatureEnabled({
            userUuid: account.user.id,
            organizationUuid: account.organization.organizationUuid,
        });
        const { organizationUuid } = account.organization;
        const [settings, rules] = await Promise.all([
            this.organizationAgentIdentitySettingsModel.get(organizationUuid),
            this.organizationAgentIdentityRulesModel.list(organizationUuid),
        ]);
        return { ...settings, rules };
    }

    async updateOrganizationSettings(
        account: Account,
        settings: OrganizationAgentIdentitySettings,
    ): Promise<OrganizationAgentIdentitySettings> {
        assertIsAccountWithOrg(account);
        const { organizationUuid } = account.organization;
        await this.assertFeatureEnabled({
            userUuid: account.user.id,
            organizationUuid,
        });
        if (
            this.createAuditedAbility(account).cannot(
                'manage',
                subject('Organization', { organizationUuid }),
            )
        ) {
            throw new ForbiddenError();
        }
        const { settings: savedSettings, previousRequired } =
            await this.organizationAgentIdentitySettingsModel.upsert(
                organizationUuid,
                settings,
            );
        if (savedSettings.requireVerifiedAgentSessions !== previousRequired) {
            const userId = this.analyticsUserId({
                userUuid: account.user.id,
                isRegisteredUser: account.user.type === 'registered',
                isServiceAccount: account.isServiceAccount(),
            });
            trackSafely(() =>
                this.analytics.track({
                    ...(userId !== null
                        ? { userId }
                        : { anonymousId: LightdashAnalytics.anonymousId }),
                    event: 'agent_identity.rule_updated',
                    properties: {
                        organizationId: organizationUuid,
                        userId,
                        warehouseType: WarehouseTypes.SNOWFLAKE,
                        required: savedSettings.requireVerifiedAgentSessions,
                        previousRequired,
                    },
                }),
            );
        }
        return { ...savedSettings, rules: await this.organizationAgentIdentityRulesModel.list(organizationUuid) };
    }

    async updateOrganizationRule(
        account: Account,
        warehouseType: WarehouseTypes,
        rule: UpdateOrganizationAgentIdentityRule,
    ): Promise<OrganizationAgentIdentityRule> {
        assertIsAccountWithOrg(account);
        const { organizationUuid } = account.organization;
        await this.assertFeatureEnabled({
            userUuid: account.user.id,
            organizationUuid,
        });
        if (
            this.createAuditedAbility(account).cannot(
                'manage',
                subject('Organization', { organizationUuid }),
            )
        ) {
            throw new ForbiddenError();
        }
        if (
            !getAgentIdentityWarehouseTypes().includes(warehouseType) ||
            !isAllowedAgentIdentitySource(warehouseType, rule.source)
        ) {
            throw new ParameterError(
                'This identity source is not supported for the warehouse type',
            );
        }
        const previous = await this.organizationAgentIdentityRulesModel.get(
            organizationUuid,
            warehouseType,
            'person',
        );
        await this.organizationAgentIdentityRulesModel.set(
            organizationUuid,
            warehouseType,
            rule,
        );
        trackSafely(() =>
            this.analytics.track({
                event: 'agent_identity.rule_updated',
                userId: account.user.id,
                properties: {
                    organizationId: organizationUuid,
                    userId: account.user.id,
                    warehouseType,
                    source: rule.source,
                    required: rule.required,
                    previousSource: previous.source,
                    previousRequired: previous.required,
                },
            }),
        );
        return { warehouseType, source: rule.source, required: rule.required };
    }

    private async authorizeProject(
        account: Account,
        projectUuid: string,
        action: 'view' | 'manage',
    ): Promise<string> {
        assertIsAccountWithOrg(account);
        const { organizationUuid } =
            await this.projectModel.getSummary(projectUuid);
        if (
            this.createAuditedAbility(account).cannot(
                action,
                subject('Project', { organizationUuid, projectUuid }),
            )
        ) {
            throw new ForbiddenError();
        }
        return organizationUuid;
    }

    async getConnectProjectId(
        account: Account | null,
        project: unknown,
        organizationId: string,
    ): Promise<string | null> {
        if (!account || typeof project !== 'string' || !isUuid(project)) {
            return null;
        }
        try {
            const projectOrganizationId = await this.authorizeProject(
                account,
                project,
                'view',
            );
            return projectOrganizationId === organizationId ? project : null;
        } catch {
            return null;
        }
    }

    trackConnectStarted(attempt: AgentConnectAttempt): void {
        trackSafely(() =>
            this.analytics.track({
                userId: attempt.userId,
                event: 'agent_identity.connect_started',
                properties: {
                    ...attempt,
                    warehouseType: WarehouseTypes.SNOWFLAKE,
                },
            }),
        );
    }

    trackConnectOutcome(
        attempt: AgentConnectAttempt,
        failureReason: AgentIdentityConnectFailureReason | null,
    ): void {
        const properties: AgentIdentityConnectProperties = {
            ...attempt,
            warehouseType: WarehouseTypes.SNOWFLAKE,
        };
        trackSafely(() =>
            this.analytics.track(
                failureReason === null
                    ? {
                          userId: attempt.userId,
                          event: 'agent_identity.connected',
                          properties: { ...properties, failureReason: null },
                      }
                    : {
                          userId: attempt.userId,
                          event: 'agent_identity.connect_failed',
                          properties: { ...properties, failureReason },
                      },
            ),
        );
    }

    private async loadConnection(
        account: Account,
        projectUuid: string,
        warehouseConnectionUuid: string | null,
        action: 'view' | 'manage' = 'manage',
        requireFeatureEnabled = false,
    ): Promise<{
        connection: CreateWarehouseCredentials;
        organizationUuid: string;
    }> {
        const organizationUuid = await this.authorizeProject(
            account,
            projectUuid,
            action,
        );
        if (requireFeatureEnabled) {
            await this.assertFeatureEnabled({
                userUuid: account.user.id,
                organizationUuid,
            });
        }
        const connection =
            warehouseConnectionUuid === null
                ? await this.projectModel.getWarehouseCredentialsForBinding(
                      projectUuid,
                      { kind: 'connection', warehouseConnectionUuid: null },
                  )
                : await this.warehouseConnectionModel.getCredentials(
                      await this.warehouseConnectionModel.getProject(
                          projectUuid,
                      ),
                      warehouseConnectionUuid,
                  );
        return { connection, organizationUuid };
    }

    async getCapabilities(
        account: Account,
        projectUuid: string,
        warehouseConnectionUuid: string | null,
    ): Promise<AiWarehouseCapabilities> {
        const { connection } = await this.loadConnection(
            account,
            projectUuid,
            warehouseConnectionUuid,
            'manage',
            true,
        );
        return {
            warehouseType: connection.type,
            marker: describeAgentMarker(connection.type),
        };
    }

    async testMarker(
        account: Account,
        projectUuid: string,
        warehouseConnectionUuid: string | null,
        runQuery: (sql: string) => Promise<Record<string, unknown>[]>,
    ): Promise<AiMarkerTestResult> {
        const { connection } = await this.loadConnection(
            account,
            projectUuid,
            warehouseConnectionUuid,
            'manage',
            true,
        );
        const marker = describeAgentMarker(connection.type);
        const result: AiMarkerTestResult = {
            ok: false,
            level: marker.level,
            observed: {},
            message: 'The agent marker check failed.',
            checkedAt: new Date(),
        };
        if (marker.level === AiAgentMarkerLevel.NONE) {
            return {
                ...result,
                message: 'This warehouse cannot mark agent queries.',
            };
        }
        try {
            const probe = agentMarkerProbe(connection.type);
            let rows: Record<string, unknown>[];
            try {
                rows = await runQuery(probe.sql);
            } catch (error) {
                if (
                    probe.fallbackSql === null ||
                    !(error instanceof Error) ||
                    !/unknown function.*CURRENT_QUERY_TAG|CURRENT_QUERY_TAG.*does not exist/i.test(
                        error.message,
                    )
                )
                    throw error;
                rows = await runQuery(probe.fallbackSql);
            }
            result.observed = Object.fromEntries(
                Object.entries(rows[0] ?? {}).map(([key, value]) => [
                    key.toLowerCase(),
                    value === null ? null : String(value),
                ]),
            );
            switch (connection.type) {
                case WarehouseTypes.POSTGRES:
                case WarehouseTypes.REDSHIFT:
                    result.ok =
                        result.observed.agent === 'true' &&
                        result.observed.application_name ===
                            AI_AGENT_APPLICATION_NAME;
                    break;
                case WarehouseTypes.SNOWFLAKE:
                    result.ok = result.observed.agent?.toLowerCase() === 'true';
                    break;
                case WarehouseTypes.DATABRICKS:
                case WarehouseTypes.BIGQUERY:
                case WarehouseTypes.ATHENA:
                case WarehouseTypes.CLICKHOUSE:
                case WarehouseTypes.TRINO:
                    result.ok = true;
                    result.observed = {
                        agent: 'true',
                        channels: marker.signals
                            .map((signal) => signal.name)
                            .join(', '),
                    };
                    break;
                case WarehouseTypes.DUCKDB:
                    break;
                default:
                    assertUnreachable(connection, 'Unknown warehouse type');
            }
            if (!result.ok) {
                result.message =
                    'The warehouse session did not report the expected agent marker.';
            } else if (marker.level === AiAgentMarkerLevel.REQUEST_BOUND) {
                result.message =
                    'The query carried the agent marker through the listed channels. Enforcement needs your access control plugin or policy to read it.';
            } else if (marker.level === AiAgentMarkerLevel.IDENTIFY_ONLY) {
                result.message =
                    'The query succeeded with agent tags sent through the listed channels. These tags identify queries; they do not enforce access.';
            } else {
                result.message =
                    'The warehouse session carries the agent marker.';
            }
        } catch {
            result.message =
                'The agent marker query failed. Check your warehouse credentials and connection.';
        }
        return { ...result, checkedAt: new Date() };
    }

    async getMyAccess(
        account: Account,
        projectUuid: string,
        warehouseConnectionUuid: string | null,
    ): Promise<AiAccessForUser> {
        const { connection, organizationUuid } = await this.loadConnection(
            account,
            projectUuid,
            warehouseConnectionUuid,
            'view',
            true,
        );
        return this.getAiAccessForUser({
            projectUuid,
            warehouseConnectionUuid,
            organizationUuid,
            connection,
            userUuid: account.user.id,
            isRegisteredUser: account.isRegisteredUser(),
            isServiceAccount: account.isServiceAccount(),
        });
    }

    recordQuery({
        queryUuid,
        projectUuid,
        warehouseConnectionUuid,
        plan,
        context,
    }: {
        queryUuid: string;
        projectUuid: string;
        warehouseConnectionUuid: string | null;
        plan: AiExecutionPlan;
        context: QueryExecutionContext;
    }): void {
        this.logger.info('Agent query', {
            queryUuid,
            projectUuid,
            warehouseConnectionUuid,
            userUuid:
                plan.identity === 'marked_person'
                    ? plan.audit.userUuid
                    : plan.audit.personUuid,
            identity: plan.identity,
            principalKind: 'person',
            principalRef: plan.audit.principalRef,
            context,
        });
    }

    private async isEnabled(
        args: Pick<AccessArgs, 'userUuid' | 'organizationUuid'>,
    ): Promise<boolean> {
        const { enabled } = await this.featureFlagModel.get({
            user: {
                userUuid: args.userUuid,
                organizationUuid: args.organizationUuid,
            },
            featureFlagId: FeatureFlags.AgentIdentity,
        });
        return enabled;
    }

    private async requiresAgentIdentity(args: AccessArgs): Promise<boolean> {
        if (args.connection.type !== WarehouseTypes.SNOWFLAKE) return false;
        const settings = await this.organizationAgentIdentitySettingsModel.get(
            args.organizationUuid,
        );
        return settings.requireVerifiedAgentSessions;
    }

    private async provider(args: AccessArgs): Promise<AiCredentialProvider> {
        if (args.isServiceAccount) {
            throw new AiAccessRefusedError(
                AiAccessRefusalReason.SERVICE_ACCOUNT,
            );
        }
        if (!args.isRegisteredUser) {
            throw new AiAccessRefusedError(
                AiAccessRefusalReason.EMBED_NOT_SUPPORTED,
            );
        }
        const provider = this.providerRegistry(args.connection.type);
        if (!provider)
            throw new AiAccessRefusedError(
                AiAccessRefusalReason.WAREHOUSE_NOT_SUPPORTED,
            );
        const configurationError = provider.configurationError();
        if (configurationError)
            throw new AiAccessRefusedError(
                AiAccessRefusalReason.WAREHOUSE_NOT_SUPPORTED,
                { message: configurationError },
            );
        return provider;
    }

    private connectEntryPoint(
        surface: QuerySurface,
    ): AgentIdentityConnectEntryPoint {
        switch (surface) {
            case QuerySurface.MCP:
                return AgentIdentityConnectEntryPoint.MCP_CONNECT_LINK;
            case QuerySurface.SLACK:
                return AgentIdentityConnectEntryPoint.SLACK_LINK;
            case QuerySurface.APP:
                return AgentIdentityConnectEntryPoint.CHAT_CARD;
            case QuerySurface.API:
            case QuerySurface.CLI:
                return AgentIdentityConnectEntryPoint.UNKNOWN;
            default:
                return assertUnreachable(surface, 'Unknown query surface');
        }
    }

    private withRefusalUrls(
        error: AiAccessRefusedError,
        projectUuid: string,
        entryPoint: AgentIdentityConnectEntryPoint,
    ): AiAccessRefusedError {
        if (error.refusal.action === AiAccessRefusalAction.SIGN_IN) {
            const connectUrl = new URL(
                '/agent/connect',
                this.lightdashConfig.siteUrl,
            );
            connectUrl.searchParams.set('project', projectUuid);
            connectUrl.searchParams.set('redirect', '/agent-connected');
            connectUrl.searchParams.set('entryPoint', entryPoint);
            return new AiAccessRefusedError(error.refusal.reason, {
                ...error.refusal,
                connectUrl: connectUrl.href,
            });
        }
        if (
            error.refusal.action === AiAccessRefusalAction.ASK_ADMIN &&
            (error.refusal.settingsUrl === null ||
                error.refusal.settingsUrl.endsWith('/aiAccess'))
        ) {
            return new AiAccessRefusedError(error.refusal.reason, {
                message: error.refusal.message,
                settingsUrl: '/generalSettings/warehouseCredentials',
            });
        }
        return error;
    }

    private analyticsUserId({
        userUuid,
        isRegisteredUser,
        isServiceAccount,
    }: Pick<AccessArgs, 'userUuid' | 'isRegisteredUser' | 'isServiceAccount'>):
        | string
        | null {
        return isRegisteredUser && !isServiceAccount ? userUuid : null;
    }

    private logRefusal(args: AccessArgs, error: AiAccessRefusedError): void {
        this.logger.warn('AI access query refused', {
            projectUuid: args.projectUuid,
            warehouseConnectionUuid: args.warehouseConnectionUuid,
            userUuid: args.userUuid,
            reason: error.refusal.reason,
            principalKind: 'person',
        });
    }

    async resolvePlan(args: ResolvePlanArgs): Promise<AiExecutionPlan | null> {
        if (
            !isAiAccessQueryContext(args.context) ||
            !(await this.isEnabled(args))
        )
            return null;
        if (!(await this.requiresAgentIdentity(args))) {
            const email =
                args.isRegisteredUser && !args.isServiceAccount
                    ? (await this.userModel.getUserDetailsByUuid(args.userUuid))
                          .email
                    : null;
            return {
                identity: 'marked_person',
                assurances: [
                    {
                        kind: 'agent_marker',
                        level: describeAgentMarker(args.connection.type).level,
                    },
                ],
                audit: {
                    personUuid: args.userUuid,
                    userUuid:
                        args.isRegisteredUser || args.isServiceAccount
                            ? args.userUuid
                            : null,
                    principalRef: email ?? args.userUuid,
                    queryTags: { [AI_AGENT_TAG]: 'true' },
                },
            };
        }
        try {
            const provider = await this.provider(args);
            const { email } = await this.userModel.getUserDetailsByUuid(
                args.userUuid,
            );
            if (!email)
                throw new UnexpectedServerError(
                    'AI access needs the person to have an email address',
                );
            const { credentials, assurances, identityUuid } =
                await provider.mint({
                    connection: args.connection,
                    person: { userUuid: args.userUuid, email },
                });
            const probe = await provider.probe(credentials, assurances);
            if (!probe.ok)
                throw new AiAccessRefusedError(
                    AiAccessRefusalReason.PRINCIPAL_FAILED,
                );
            return {
                identity: 'connected_person',
                identityUuid,
                credentials,
                assurances,
                audit: {
                    personUuid: args.userUuid,
                    principalRef: args.userUuid,
                    queryTags: { [AI_PRINCIPAL_QUERY_TAG]: args.userUuid },
                },
            };
        } catch (error) {
            if (error instanceof AiAccessRefusedError) {
                const refusalError = this.withRefusalUrls(
                    error,
                    args.projectUuid,
                    args.evaluation.kind === 'query'
                        ? this.connectEntryPoint(args.evaluation.surface)
                        : AgentIdentityConnectEntryPoint.UNKNOWN,
                );
                this.logRefusal(args, refusalError);
                if (args.evaluation.kind === 'query') {
                    const userId = this.analyticsUserId(args);
                    const actor =
                        userId !== null
                            ? { userId }
                            : { anonymousId: LightdashAnalytics.anonymousId };
                    const properties = {
                        organizationId: args.organizationUuid,
                        projectId: args.projectUuid,
                        userId,
                        warehouseConnectionId: args.warehouseConnectionUuid,
                        surface: args.evaluation.surface,
                        warehouseType: args.connection.type,
                        reason: refusalError.refusal.reason,
                    };
                    trackSafely(() =>
                        this.analytics.track({
                            ...actor,
                            event: 'query.refused',
                            properties,
                        }),
                    );
                    if (
                        properties.reason ===
                        AiAccessRefusalReason.SIGN_IN_EXPIRED
                    ) {
                        trackSafely(() =>
                            this.analytics.track({
                                ...actor,
                                event: 'agent_identity.expired',
                                properties: {
                                    ...properties,
                                    reason: AiAccessRefusalReason.SIGN_IN_EXPIRED,
                                },
                            }),
                        );
                    }
                }
                throw refusalError;
            }
            throw error;
        }
    }

    async assertCanReadResults(
        account: Account,
        projectUuid: string,
        queryHistory: QueryHistory,
        ancestors = new Set<string>(),
    ): Promise<AiExecutionPlan | null> {
        if (ancestors.has(queryHistory.queryUuid)) {
            throw new AiAccessRefusedError(
                AiAccessRefusalReason.RESULT_NOT_AGENT_PRODUCED,
            );
        }
        const { connection, organizationUuid } = await this.loadConnection(
            account,
            projectUuid,
            queryHistory.warehouseConnectionUuid ?? null,
            'view',
        );
        const plan = await this.resolvePlan({
            evaluation: { kind: 'result_read' },
            projectUuid,
            organizationUuid,
            warehouseConnectionUuid:
                queryHistory.warehouseConnectionUuid ?? null,
            connection,
            context: QueryExecutionContext.AI,
            userUuid: account.user.id,
            isRegisteredUser: account.isRegisteredUser(),
            isServiceAccount: account.isServiceAccount(),
        });
        if (queryHistory.status === QueryHistoryStatus.READY) {
            const execution = await this.queryHistoryModel.getDuckdbExecution(
                queryHistory.queryUuid,
            );
            const sources = Object.values(execution?.references ?? {});
            if (sources.length > 0) {
                const nextAncestors = new Set(ancestors).add(
                    queryHistory.queryUuid,
                );
                const sourcePlans = await Promise.all(
                    sources.map(async (queryUuid) => {
                        const source = await this.queryHistoryModel.get(
                            queryUuid,
                            projectUuid,
                            account,
                        );
                        return this.assertCanReadResults(
                            account,
                            projectUuid,
                            source,
                            nextAncestors,
                        );
                    }),
                );
                const connectedPlan = sourcePlans.find(
                    (sourcePlan) => sourcePlan?.identity === 'connected_person',
                );
                if (
                    sourcePlans.some(
                        (sourcePlan) =>
                            sourcePlan?.identity === 'connected_person' &&
                            sourcePlan.identityUuid !==
                                queryHistory.requestParameters
                                    .aiSignInCredentialUuid,
                    )
                ) {
                    throw new AiAccessRefusedError(
                        AiAccessRefusalReason.RESULT_NOT_AGENT_PRODUCED,
                    );
                }
                return connectedPlan ?? plan;
            }
        }
        if (
            plan?.identity === 'connected_person' &&
            queryHistory.status === QueryHistoryStatus.READY &&
            queryHistory.requestParameters.aiSignInCredentialUuid !==
                plan.identityUuid
        ) {
            throw new AiAccessRefusedError(
                AiAccessRefusalReason.RESULT_NOT_AGENT_PRODUCED,
            );
        }
        return plan;
    }

    async getAiAccessForUser(args: AccessArgs): Promise<AiAccessForUser> {
        const enabled = await this.isEnabled(args);
        const required = enabled && (await this.requiresAgentIdentity(args));
        const result: AiAccessForUser = {
            requirementSource: required ? 'organization' : null,
            identity: enabled ? 'marked_person' : null,
            marker: enabled ? describeAgentMarker(args.connection.type) : null,
            projectUuid: args.projectUuid,
            warehouseConnectionUuid: args.warehouseConnectionUuid,
            enabled,
            principalKind: enabled ? 'person' : null,
            refusal: null,
            expiresAt: null,
        };
        if (!required) return result;
        result.identity = 'connected_person';
        try {
            const provider = await this.provider(args);
            const { email } = await this.userModel.getUserDetailsByUuid(
                args.userUuid,
            );
            if (!email)
                throw new UnexpectedServerError(
                    'AI access needs the person to have an email address',
                );
            const missingPrerequisite = await provider.missingPrerequisite({
                connection: args.connection,
                person: { userUuid: args.userUuid, email },
            });
            if (missingPrerequisite !== null)
                throw new AiAccessRefusedError(missingPrerequisite);
            const credential =
                await this.userWarehouseCredentialsModel.findAiCredentialWithSecrets(
                    {
                        userUuid: args.userUuid,
                        warehouseType: args.connection.type,
                    },
                );
            result.expiresAt = credential?.expiresAt ?? null;
        } catch (error) {
            if (!(error instanceof AiAccessRefusedError)) throw error;
            const refusalError = this.withRefusalUrls(
                error,
                args.projectUuid,
                AgentIdentityConnectEntryPoint.UNKNOWN,
            );
            this.logRefusal(args, refusalError);
            result.refusal = refusalError.refusal;
        }
        return result;
    }
}
