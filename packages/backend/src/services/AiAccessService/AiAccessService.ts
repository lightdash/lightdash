import { subject } from '@casl/ability';
import {
    AGENT_IDENTITY_SETTINGS_PATH,
    AgentActorSurface,
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
    assertRegisteredAccount,
    assertUnreachable,
    buildAgentIdentityClaim,
    buildSnowflakeAgentIntegrationSql,
    FeatureFlags,
    FeatureNotEnabledError,
    ForbiddenError,
    getAgentIdentityWarehouseTypes,
    getAiExecutionCredentialUuid,
    getSnowflakeAgentRedirectUri,
    isAiAccessQueryContext,
    isAllowedAgentIdentitySource,
    NotFoundError,
    ParameterError,
    parseSnowflakeAccountUrl,
    QueryExecutionContext,
    QueryHistoryStatus,
    QuerySurface,
    UnexpectedServerError,
    WarehouseTypes,
    type Account,
    type AiAccessForUser,
    type AiActorKind,
    type AiExecutionPlan,
    type AiIdentitySource,
    type AiMarkerTestResult,
    type AiWarehouseCapabilities,
    type CreateWarehouseCredentials,
    type OrganizationAgentIdentityOverview,
    type OrganizationAgentIdentityRule,
    type OrganizationAgentIdentitySettings,
    type OrganizationAgentIdentitySnowflakeSetup,
    type OrganizationAgentIdentitySnowflakeVerify,
    type QueryHistory,
    type SessionUser,
    type UpdateOrganizationAgentIdentityRule,
    type UpdateOrganizationSnowflakeAgentClient,
} from '@lightdash/common';
import { validate as isUuid } from 'uuid';
import {
    LightdashAnalytics,
    type AgentIdentityConnectProperties,
} from '../../analytics/LightdashAnalytics';
import { trackSafely } from '../../analytics/trackSafely';
import { type LightdashConfig } from '../../config/parseConfig';
import { createAuditLogEvent } from '../../logging/auditLog';
import { createActorFromAccount } from '../../logging/caslAuditWrapper';
import { redactCredentialError } from '../../logging/redactCredentialError';
import { logAuditEvent } from '../../logging/winston';
import { withCause } from '../../logging/withCause';
import { type AiServiceAccountCredentialsModel } from '../../models/AiServiceAccountCredentialsModel/AiServiceAccountCredentialsModel';
import { type FeatureFlagModel } from '../../models/FeatureFlagModel/FeatureFlagModel';
import { type OrganizationAgentIdentityRulesModel } from '../../models/OrganizationAgentIdentityRulesModel';
import { type OrganizationAgentIdentitySettingsModel } from '../../models/OrganizationAgentIdentitySettingsModel';
import { type OrganizationSnowflakeAgentClientModel } from '../../models/OrganizationSnowflakeAgentClientModel';
import { type ProjectModel } from '../../models/ProjectModel/ProjectModel';
import {
    type QueryHistoryModel,
    type QueryHistoryWithLineage,
} from '../../models/QueryHistoryModel/QueryHistoryModel';
import { type UserModel } from '../../models/UserModel';
import { type UserWarehouseCredentialsModel } from '../../models/UserWarehouseCredentials/UserWarehouseCredentialsModel';
import { type WarehouseConnectionModel } from '../../models/WarehouseConnectionModel/WarehouseConnectionModel';
import { applyAiServiceAccountCredentials } from '../AiServiceAccountService/applyAiServiceAccountCredentials';
import {
    AiServiceAccountSlotResolutionError,
    AiServiceAccountSlotResolver,
} from '../AiServiceAccountService/resolveAiServiceAccountSlot';
import { BaseService } from '../BaseService';
import {
    connectionContextFromUser,
    connectionSurfaceFromQuerySurface,
    getAccountAgentIdentityFacts,
    getAgentActor,
} from '../WarehouseClientFactory/ConnectionContext';
import { resolveQueryAgentActor } from './agentExecutionContext';
import { describeAgentMarker } from './agentMarker';
import { agentMarkerProbe } from './agentMarkerProbe';
import {
    AgentSessionCheckError,
    type AiCredentialProvider,
} from './providers/AiCredentialProvider';
import { type AiCredentialProviderRegistry } from './providers/registry';
import {
    getQueryIdentityLineage,
    getQuerySourceParameters,
} from './queryResultLineage';
import { SnowflakeAgentClientResolver } from './SnowflakeAgentClientResolver';

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
    serviceAccountUuid?: string | null;
    oauthClientId?: string | null;
    agentActor?: { surface: AgentActorSurface; clientId: string | null } | null;
};

type AccessArgs = Omit<ResolvePlanArgs, 'context' | 'evaluation'>;

type AiAccessServiceArguments = {
    analytics: Pick<LightdashAnalytics, 'track'>;
    aiServiceAccountCredentialsModel: AiServiceAccountCredentialsModel;
    organizationAgentIdentityRulesModel: OrganizationAgentIdentityRulesModel;
    organizationAgentIdentitySettingsModel: OrganizationAgentIdentitySettingsModel;
    organizationSnowflakeAgentClientModel: OrganizationSnowflakeAgentClientModel;
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
    private readonly aiServiceAccountCredentialsModel: AiServiceAccountCredentialsModel;

    private readonly analytics: Pick<LightdashAnalytics, 'track'>;

    private readonly organizationAgentIdentityRulesModel: OrganizationAgentIdentityRulesModel;

    private readonly organizationAgentIdentitySettingsModel: OrganizationAgentIdentitySettingsModel;

    private readonly organizationSnowflakeAgentClientModel: OrganizationSnowflakeAgentClientModel;

    private readonly snowflakeAgentClientResolver: SnowflakeAgentClientResolver;

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
        aiServiceAccountCredentialsModel,
        organizationAgentIdentityRulesModel,
        organizationAgentIdentitySettingsModel,
        organizationSnowflakeAgentClientModel,
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
        this.aiServiceAccountCredentialsModel =
            aiServiceAccountCredentialsModel;
        this.organizationAgentIdentityRulesModel =
            organizationAgentIdentityRulesModel;
        this.organizationAgentIdentitySettingsModel =
            organizationAgentIdentitySettingsModel;
        this.organizationSnowflakeAgentClientModel =
            organizationSnowflakeAgentClientModel;
        this.snowflakeAgentClientResolver = new SnowflakeAgentClientResolver({
            lightdashConfig,
            organizationSnowflakeAgentClientModel,
        });
        this.lightdashConfig = lightdashConfig;
        this.featureFlagModel = featureFlagModel;
        this.userModel = userModel;
        this.userWarehouseCredentialsModel = userWarehouseCredentialsModel;
        this.projectModel = projectModel;
        this.queryHistoryModel = queryHistoryModel;
        this.warehouseConnectionModel = warehouseConnectionModel;
        this.providerRegistry = providerRegistry;
    }

    async resolveSnowflakeAgentClient(organizationUuid: string) {
        return this.snowflakeAgentClientResolver.resolve(organizationUuid);
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
        const rule = await this.organizationAgentIdentityRulesModel.get(
            organizationUuid,
            WarehouseTypes.SNOWFLAKE,
            'person',
        );
        if (rule.source !== 'agent_sign_in') return { required: false };
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
            person: { organizationUuid, userUuid, email: user.email ?? '' },
            silentRefresh: await this.isSilentRefreshEnabled(
                { userUuid, organizationUuid },
                provider.warehouseType,
            ),
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
        const canManage = this.createAuditedAbility(account).can(
            'manage',
            subject('Organization', { organizationUuid }),
        );
        return {
            ...settings,
            snowflakeConfigured:
                await this.snowflakeAgentClientResolver.isConfigured(
                    organizationUuid,
                ),
            rules: await Promise.all(
                rules.map(async (rule) => ({
                    ...rule,
                    projectsMissingAiServiceAccount:
                        canManage && rule.source === 'ai_service_account'
                            ? await this.aiServiceAccountCredentialsModel.findProjectsMissingSlot(
                                  organizationUuid,
                                  rule.warehouseType,
                              )
                            : null,
                })),
            ),
        };
    }

    private async authorizeSnowflakeSetup(account: Account): Promise<string> {
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
        return organizationUuid;
    }

    async getSnowflakeSetup(
        account: Account,
    ): Promise<OrganizationAgentIdentitySnowflakeSetup> {
        const organizationUuid = await this.authorizeSnowflakeSetup(account);
        const redirectUri = getSnowflakeAgentRedirectUri(
            this.lightdashConfig.siteUrl,
        );
        const metadata =
            await this.organizationSnowflakeAgentClientModel.getMetadata(
                organizationUuid,
            );
        const resolved = metadata
            ? null
            : await this.snowflakeAgentClientResolver.resolve(organizationUuid);
        const missingSettings =
            await this.snowflakeAgentClientResolver.getMissingSettings(
                organizationUuid,
                metadata ? undefined : resolved,
            );
        return {
            redirectUri,
            integrationSql: buildSnowflakeAgentIntegrationSql({ redirectUri }),
            missingSettings,
            configured: missingSettings.length === 0,
            client: {
                source: metadata ? 'organization' : (resolved?.source ?? null),
                accountUrl: metadata?.accountUrl ?? resolved?.accessUrl ?? null,
                clientId: metadata?.clientId ?? resolved?.clientId ?? null,
                hasClientSecret: metadata
                    ? !missingSettings.includes(
                          'Snowflake client secret (replace it)',
                      )
                    : resolved !== null,
                updatedAt: metadata?.updatedAt ?? null,
            },
        };
    }

    async saveSnowflakeAgentClient(
        account: Account,
        body: UpdateOrganizationSnowflakeAgentClient,
    ): Promise<OrganizationAgentIdentitySnowflakeSetup> {
        const organizationUuid = await this.authorizeSnowflakeSetup(account);
        assertRegisteredAccount(account);
        const { accountUrl, accountIdentifier } = parseSnowflakeAccountUrl(
            body.accountUrl,
        );
        const clientId = body.clientId.trim();
        if (!clientId || !body.clientSecret.trim()) {
            throw new ParameterError('Provide a client ID and client secret.');
        }
        const { action } =
            await this.organizationSnowflakeAgentClientModel.upsert({
                organizationUuid,
                accountUrl,
                accountIdentifier,
                clientId,
                clientSecret: body.clientSecret,
                userUuid: account.user.id,
            });
        trackSafely(() =>
            this.analytics.track({
                userId: account.user.id,
                event: 'agent_identity.snowflake_client_saved',
                properties: {
                    organizationId: organizationUuid,
                    userId: account.user.id,
                    warehouseType: WarehouseTypes.SNOWFLAKE,
                    action,
                },
            }),
        );
        return this.getSnowflakeSetup(account);
    }

    async verifySnowflakeSetup(
        account: Account,
    ): Promise<OrganizationAgentIdentitySnowflakeVerify> {
        const organizationUuid = await this.authorizeSnowflakeSetup(account);
        const resolved =
            await this.snowflakeAgentClientResolver.resolve(organizationUuid);
        const missingSettings =
            await this.snowflakeAgentClientResolver.getMissingSettings(
                organizationUuid,
            );
        const configured = missingSettings.length === 0;
        const clientSourceDetail =
            resolved?.source === 'organization'
                ? 'Using the client saved for this organisation.'
                : 'Using the instance SNOWFLAKE_AI_OAUTH_* settings.';
        const missingSettingsDetail = configured
            ? ''
            : `Missing: ${missingSettings.join(', ')}.`;
        const checks: OrganizationAgentIdentitySnowflakeVerify['checks'] = [
            {
                id: 'oauth_client',
                label: 'OAuth client settings',
                required: true,
                status: resolved ? 'passed' : 'failed',
                detail: resolved
                    ? [clientSourceDetail, missingSettingsDetail]
                          .filter(Boolean)
                          .join(' ')
                    : missingSettingsDetail,
            },
        ];
        const endpointCheck: OrganizationAgentIdentitySnowflakeVerify['checks'][number] =
            {
                id: 'authorize_endpoint',
                label: 'Authorization endpoint',
                required: true,
                status: 'not_checked',
                detail: 'Set the missing OAuth client settings before checking the endpoint.',
            };
        if (resolved) {
            try {
                const endpoint = new URL(resolved.authorizationEndpoint);
                endpoint.username = '';
                endpoint.password = '';
                endpoint.search = '';
                endpoint.hash = '';
                const response = await fetch(endpoint.href, {
                    method: 'GET',
                    redirect: 'manual',
                    signal: AbortSignal.timeout(5000),
                });
                endpointCheck.status = [
                    200, 302, 303, 307, 400, 401, 403,
                ].includes(response.status)
                    ? 'passed'
                    : 'failed';
                const endpointHint =
                    resolved.source === 'organization'
                        ? ' Check the Snowflake account URL.'
                        : ' Check SNOWFLAKE_AI_OAUTH_AUTHORIZATION_ENDPOINT.';
                endpointCheck.detail =
                    endpointCheck.status === 'passed'
                        ? `Snowflake answered (HTTP ${response.status}).`
                        : `The authorization endpoint returned HTTP ${response.status}.${
                              [404, 405].includes(response.status)
                                  ? endpointHint
                                  : ''
                          }`;
                await response.body?.cancel();
            } catch (error) {
                endpointCheck.status = 'failed';
                endpointCheck.detail =
                    error instanceof Error &&
                    (error.name === 'TimeoutError' ||
                        error.name === 'AbortError')
                        ? 'The authorization endpoint did not respond within 5 seconds.'
                        : 'Could not reach the authorization endpoint.';
            }
        }
        checks.push(endpointCheck);
        const hasAgentSession = resolved
            ? await this.userWarehouseCredentialsModel.hasOrganizationAiSnowflakeCredential(
                  organizationUuid,
                  resolved.clientVersion,
              )
            : false;
        checks.push({
            id: 'agent_session',
            label: 'Agent session',
            required: false,
            status: hasAgentSession ? 'passed' : 'not_checked',
            detail: hasAgentSession
                ? 'Someone in this organisation has connected an agent with an activated Snowflake agent session.'
                : 'No one has connected their agent yet. Connect your own agent in My warehouse connections to confirm Snowflake marks sessions as agent sessions.',
        });
        return {
            checkedAt: new Date(),
            passed:
                configured &&
                checks.every(
                    (check) => !check.required || check.status === 'passed',
                ),
            checks,
        };
    }

    private async assertSnowflakeAgentConfigured(
        organizationUuid: string,
    ): Promise<void> {
        if (
            !(await this.snowflakeAgentClientResolver.isConfigured(
                organizationUuid,
            ))
        ) {
            throw new ParameterError(
                'The Snowflake agent integration is not configured on this instance',
            );
        }
    }

    async updateOrganizationSettings(
        account: Account,
        settings: OrganizationAgentIdentitySettings,
    ): Promise<OrganizationAgentIdentityOverview> {
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
        if (settings.requireVerifiedAgentSessions)
            await this.assertSnowflakeAgentConfigured(organizationUuid);
        const {
            settings: savedSettings,
            previousSource,
            changed,
        } = await this.organizationAgentIdentitySettingsModel.upsert(
            organizationUuid,
            settings,
        );
        const source = savedSettings.requireVerifiedAgentSessions
            ? 'agent_sign_in'
            : 'marked_person';
        if (changed) {
            this.recordRuleChange(
                account,
                WarehouseTypes.SNOWFLAKE,
                previousSource,
                source,
            );
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
                        source,
                        previousSource,
                    },
                }),
            );
        }
        return {
            ...savedSettings,
            snowflakeConfigured:
                await this.snowflakeAgentClientResolver.isConfigured(
                    organizationUuid,
                ),
            rules: await this.organizationAgentIdentityRulesModel.list(
                organizationUuid,
            ),
        };
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
        if (
            warehouseType === WarehouseTypes.SNOWFLAKE &&
            rule.source === 'agent_sign_in'
        ) {
            await this.assertSnowflakeAgentConfigured(organizationUuid);
        }
        const { previousSource, changed } =
            await this.organizationAgentIdentityRulesModel.set(
                organizationUuid,
                warehouseType,
                rule,
            );
        if (changed) {
            this.recordRuleChange(
                account,
                warehouseType,
                previousSource,
                rule.source,
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
                        previousSource,
                    },
                }),
            );
        }
        return {
            warehouseType,
            source: rule.source,
            projectsMissingAiServiceAccount:
                rule.source === 'ai_service_account'
                    ? await this.aiServiceAccountCredentialsModel.findProjectsMissingSlot(
                          organizationUuid,
                          warehouseType,
                      )
                    : null,
        };
    }

    private recordRuleChange(
        account: Account,
        warehouseType: WarehouseTypes,
        previousSource: AiIdentitySource,
        source: AiIdentitySource,
    ): void {
        try {
            assertIsAccountWithOrg(account);
            logAuditEvent(
                createAuditLogEvent(
                    createActorFromAccount(account),
                    'update',
                    {
                        type: 'OrganizationAgentIdentityRule',
                        organizationUuid: account.organization.organizationUuid,
                        metadata: {
                            event: 'agent_identity.rule_updated',
                            warehouseType,
                            previousSource,
                            source,
                        },
                    },
                    {},
                    'allowed',
                ),
            );
        } catch (error) {
            this.logger.warn(
                'Failed to write the agent identity rule audit event',
                redactCredentialError(error),
            );
        }
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
        error: unknown = null,
    ): void {
        if (failureReason !== null) {
            this.logger.warn('Agent sign-in connect failed', {
                userUuid: attempt.userId,
                organizationUuid: attempt.organizationId,
                reason: failureReason,
                ...(error === null ? {} : redactCredentialError(error)),
            });
        }
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
            inheritedFromProjectUuid:
                plan.identity === 'ai_service_account'
                    ? plan.inheritedFromProjectUuid
                    : null,
            queryUuid,
            projectUuid,
            warehouseConnectionUuid,
            userUuid:
                plan.identity === 'connected_person'
                    ? plan.audit.personUuid
                    : plan.audit.userUuid,
            identity: plan.identity,
            actorKind: plan.audit.actorKind,
            actorSurface: plan.agentIdentity?.act.surface ?? null,
            actorClientId: plan.agentIdentity?.act.client_id ?? null,
            principalKind:
                plan.identity === 'ai_service_account'
                    ? 'service_account'
                    : plan.audit.actorKind,
            credentialUuid:
                plan.identity === 'ai_service_account'
                    ? plan.credentialUuid
                    : getAiExecutionCredentialUuid(plan),
            identityUuid: getAiExecutionCredentialUuid(plan),
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

    private async isSilentRefreshEnabled(
        args: Pick<AccessArgs, 'userUuid' | 'organizationUuid'>,
        warehouseType: WarehouseTypes,
    ): Promise<boolean> {
        if (warehouseType !== WarehouseTypes.SNOWFLAKE) return false;
        const { enabled } = await this.featureFlagModel.get({
            user: {
                userUuid: args.userUuid,
                organizationUuid: args.organizationUuid,
            },
            featureFlagId: FeatureFlags.AgentIdentitySilentRefresh,
        });
        return enabled;
    }

    private actorKind(args: AccessArgs): AiActorKind {
        return args.isServiceAccount ? 'service_account' : 'person';
    }

    private async markedPlan(args: AccessArgs): Promise<AiExecutionPlan> {
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
                actorKind: this.actorKind(args),
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
        const configurationError = await provider.configurationError(
            args.organizationUuid,
        );
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
            const refusal = new AiAccessRefusedError(error.refusal.reason, {
                ...error.refusal,
                connectUrl: connectUrl.href,
            });
            return withCause(refusal, error.cause ?? error);
        }
        if (
            error.refusal.action === AiAccessRefusalAction.ASK_ADMIN &&
            (error.refusal.settingsUrl === null ||
                error.refusal.settingsUrl.endsWith('/aiAccess'))
        ) {
            const refusal = new AiAccessRefusedError(error.refusal.reason, {
                message: error.refusal.message,
                settingsUrl: AGENT_IDENTITY_SETTINGS_PATH,
            });
            return withCause(refusal, error.cause ?? error);
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

    trackQueryRefusal(
        args: Pick<
            ResolvePlanArgs,
            | 'agentActor'
            | 'evaluation'
            | 'organizationUuid'
            | 'projectUuid'
            | 'warehouseConnectionUuid'
            | 'userUuid'
            | 'isRegisteredUser'
            | 'isServiceAccount'
        > & { warehouseType: WarehouseTypes },
        reason: AiAccessRefusalReason,
        inheritedFromProjectUuid: string | null = null,
    ): void {
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
                warehouseType: args.warehouseType,
                reason,
                inheritedFromProjectUuid,
                actor:
                    args.agentActor !== undefined
                        ? args.agentActor
                        : getAgentActor({
                              surface: connectionSurfaceFromQuerySurface(
                                  args.evaluation.surface,
                                  null,
                              ),
                              person: null,
                              aiClient: null,
                          }),
            };
            trackSafely(() =>
                this.analytics.track({
                    ...actor,
                    event: 'query.refused',
                    properties,
                }),
            );
            if (properties.reason === AiAccessRefusalReason.SIGN_IN_EXPIRED) {
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
    }

    private logRefusal(
        args: AccessArgs,
        error: AiAccessRefusedError,
        level: 'warn' | 'debug' = 'warn',
        inheritedFromProjectUuid: string | null = null,
    ): void {
        const sessionCheckError =
            error.cause instanceof AgentSessionCheckError ? error.cause : null;
        const cause = sessionCheckError?.cause ?? error.cause;
        this.logger[level]('AI access query refused', {
            inheritedFromProjectUuid,
            projectUuid: args.projectUuid,
            warehouseConnectionUuid: args.warehouseConnectionUuid,
            userUuid: args.userUuid,
            reason: error.refusal.reason,
            actorKind: this.actorKind(args),
            principalKind: this.actorKind(args),
            ...(sessionCheckError
                ? { sessionCheckReason: sessionCheckError.reason }
                : {}),
            ...(cause ? redactCredentialError(cause) : {}),
        });
    }

    async resolvePlan(args: ResolvePlanArgs): Promise<AiExecutionPlan | null> {
        if (
            !isAiAccessQueryContext(args.context) ||
            !(await this.isEnabled(args))
        )
            return null;
        const actor = resolveQueryAgentActor({
            context: args.context,
            querySurface:
                args.evaluation.kind === 'query'
                    ? args.evaluation.surface
                    : null,
            oauthClientId: args.oauthClientId ?? null,
            explicitActor: args.agentActor,
        });
        const plan = await this.resolveEnabledPlan({
            ...args,
            agentActor: actor,
        });
        const subjectUuid = args.isServiceAccount
            ? args.serviceAccountUuid
            : args.userUuid;
        return {
            ...plan,
            agentIdentity:
                actor &&
                subjectUuid &&
                (args.isRegisteredUser || args.isServiceAccount)
                    ? buildAgentIdentityClaim({
                          subject: {
                              type: args.isServiceAccount
                                  ? 'service_account'
                                  : 'user',
                              uuid: subjectUuid,
                          },
                          ...actor,
                      })
                    : null,
        };
    }

    private get slotResolver() {
        return new AiServiceAccountSlotResolver({
            projectModel: this.projectModel,
            warehouseConnectionModel: this.warehouseConnectionModel,
            aiServiceAccountCredentialsModel:
                this.aiServiceAccountCredentialsModel,
        });
    }

    private async resolveEnabledPlan(
        args: ResolvePlanArgs,
    ): Promise<AiExecutionPlan> {
        const rule = await this.organizationAgentIdentityRulesModel.get(
            args.organizationUuid,
            args.connection.type,
            this.actorKind(args),
        );
        let inheritedFromProjectUuid: string | null = null;
        try {
            if (rule.source === 'marked_person')
                return await this.markedPlan(args);
            if (!args.isRegisteredUser && !args.isServiceAccount) {
                throw new AiAccessRefusedError(
                    AiAccessRefusalReason.EMBED_NOT_SUPPORTED,
                );
            }
            if (rule.source === 'ai_service_account') {
                let saved;
                try {
                    saved = await this.slotResolver.resolve({
                        projectUuid: args.projectUuid,
                        connection: args.warehouseConnectionUuid,
                    });
                    inheritedFromProjectUuid = saved?.inherited
                        ? saved.sourceProjectUuid
                        : null;
                } catch (error) {
                    if (error instanceof AiServiceAccountSlotResolutionError)
                        inheritedFromProjectUuid =
                            error.inheritedFromProjectUuid;
                    throw new AiAccessRefusedError(
                        AiAccessRefusalReason.AI_SERVICE_ACCOUNT_INVALID,
                    );
                }
                if (saved === null) {
                    throw new AiAccessRefusedError(
                        AiAccessRefusalReason.AI_SERVICE_ACCOUNT_MISSING,
                    );
                }
                let credentials;
                try {
                    credentials = applyAiServiceAccountCredentials(
                        args.connection,
                        saved.slot.secrets,
                    );
                } catch {
                    throw new AiAccessRefusedError(
                        AiAccessRefusalReason.AI_SERVICE_ACCOUNT_INVALID,
                    );
                }
                return {
                    identity: 'ai_service_account',
                    sourceProjectUuid: saved.sourceProjectUuid,
                    inheritedFromProjectUuid,
                    identityUuid: saved.slot.slot.identityUuid,
                    credentialUuid: saved.slot.slot.uuid,
                    credentials,
                    assurances: [
                        {
                            kind: 'agent_marker',
                            level: describeAgentMarker(args.connection.type)
                                .level,
                        },
                        { kind: 'result_cache_off' },
                    ],
                    audit: {
                        actorKind: this.actorKind(args),
                        personUuid: args.userUuid,
                        userUuid: args.userUuid,
                        principalRef: saved.slot.slot.uuid,
                        queryTags: { [AI_AGENT_TAG]: 'true' },
                    },
                };
            }
            if (rule.source !== 'agent_sign_in')
                return assertUnreachable(
                    rule.source,
                    'Unknown AI identity source',
                );
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
                    organizationUuid: args.organizationUuid,
                    evaluationKind: args.evaluation.kind,
                    person: {
                        organizationUuid: args.organizationUuid,
                        userUuid: args.userUuid,
                        email,
                    },
                    silentRefresh: await this.isSilentRefreshEnabled(
                        args,
                        provider.warehouseType,
                    ),
                });
            const probe = await provider.probe(credentials, assurances);
            if (!probe.ok) {
                throw withCause(
                    new AiAccessRefusedError(
                        AiAccessRefusalReason.PRINCIPAL_FAILED,
                    ),
                    new AgentSessionCheckError(
                        probe.reason,
                        probe.message,
                        probe.cause,
                    ),
                );
            }
            return {
                identity: 'connected_person',
                identityUuid,
                credentials,
                assurances,
                audit: {
                    actorKind: this.actorKind(args),
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
                this.logRefusal(
                    args,
                    refusalError,
                    args.evaluation.kind === 'diagnostic' ? 'debug' : 'warn',
                    inheritedFromProjectUuid,
                );
                this.trackQueryRefusal(
                    { ...args, warehouseType: args.connection.type },
                    refusalError.refusal.reason,
                    inheritedFromProjectUuid,
                );
                throw refusalError;
            }
            throw error;
        }
    }

    async assertCanReadResults(
        account: Account,
        projectUuid: string,
        queryHistory: QueryHistoryWithLineage,
        {
            agentProducedOnly = false,
            evaluation = { kind: 'result_read' },
        }: {
            agentProducedOnly?: boolean;
            evaluation?: AiAccessEvaluation;
        } = {},
    ): Promise<AiExecutionPlan | null> {
        const plans = await this.assertCanReadResultsForQueries(
            account,
            projectUuid,
            [{ queryHistory, agentProducedOnly }],
            evaluation,
        );
        return plans.get(queryHistory.queryUuid) ?? null;
    }

    async assertCanReadResultsForQueries(
        account: Account,
        projectUuid: string,
        roots: {
            queryHistory: QueryHistoryWithLineage;
            agentProducedOnly: boolean;
        }[],
        evaluation: AiAccessEvaluation = { kind: 'result_read' },
        onIdentityEnabled?: () => void,
        queryContext: QueryExecutionContext | null = null,
    ): Promise<Map<string, AiExecutionPlan | null>> {
        const uniqueRoots = [
            ...new Map(
                roots.map((root) => [root.queryHistory.queryUuid, root]),
            ).values(),
        ];
        const relevantRoots = uniqueRoots.filter(
            ({ queryHistory: root, agentProducedOnly }) => {
                const { references } = getQuerySourceParameters(
                    root.requestParameters,
                );
                return (
                    !agentProducedOnly ||
                    isAiAccessQueryContext(root.context) ||
                    !!root.requestParameters?.aiSignInCredentialUuid ||
                    Object.keys(references ?? {}).length > 0 ||
                    root.duckdbExecutionReferences === undefined ||
                    Object.keys(root.duckdbExecutionReferences ?? {}).length > 0
                );
            },
        );
        if (relevantRoots.length === 0) return new Map();
        const { queryHistory } = relevantRoots[0];
        const organizationUuid =
            queryHistory.organizationUuid ??
            (await this.projectModel.getSummary(projectUuid)).organizationUuid;
        if (
            !(await this.isEnabled({
                userUuid: account.user.id,
                organizationUuid,
            }))
        ) {
            return new Map();
        }

        const agentActor =
            evaluation.kind === 'query'
                ? resolveQueryAgentActor({
                      context:
                          queryContext ??
                          QueryExecutionContext.COMPOSE_SQL_RUNNER,
                      querySurface: evaluation.surface,
                      oauthClientId:
                          getAccountAgentIdentityFacts(account).oauthClientId,
                  })
                : null;
        onIdentityEnabled?.();
        const visited = new Set(
            uniqueRoots.map((root) => root.queryHistory.queryUuid),
        );
        const maxNodes = 500;
        const maxDepth = 50;
        const logLineageRefusal = (
            refusedNode: string,
            reason: string,
            depth: number | null = null,
        ) => {
            this.logger.warn('Agent result lineage refused', {
                queryUuid: queryHistory.queryUuid,
                refusedNode,
                reason,
                ...(reason === 'depth_limit' || reason === 'size_limit'
                    ? { depth, size: visited.size, maxDepth, maxNodes }
                    : {}),
            });
        };
        const logLookupRefusal = (error: unknown, refusedNode: string) => {
            if (error instanceof NotFoundError)
                logLineageRefusal(refusedNode, 'ancestor_not_found');
            else if (error instanceof ForbiddenError)
                logLineageRefusal(refusedNode, 'ancestor_forbidden');
            throw error;
        };
        const refuse = (
            refusedNode: string,
            reason: string,
            depth: number | null = null,
        ) => {
            logLineageRefusal(refusedNode, reason, depth);
            return new AiAccessRefusedError(
                AiAccessRefusalReason.RESULT_NOT_AGENT_PRODUCED,
            );
        };
        const nodes = new Map<
            string,
            {
                queryHistory: QueryHistory;
                sources: string[];
                isDuckdbExecution: boolean;
            }
        >();
        if (visited.size > maxNodes)
            throw refuse(queryHistory.queryUuid, 'size_limit', 0);
        const rootLevel = await Promise.all(
            uniqueRoots.map(async ({ queryHistory: root }) => {
                if (root.duckdbExecutionReferences === undefined) {
                    return {
                        queryHistory: root,
                        execution: await this.queryHistoryModel
                            .getDuckdbExecution(root.queryUuid)
                            .catch((error: unknown) =>
                                logLookupRefusal(error, root.queryUuid),
                            ),
                    };
                }
                return {
                    queryHistory: root,
                    execution:
                        root.duckdbExecutionReferences === null
                            ? null
                            : { references: root.duckdbExecutionReferences },
                };
            }),
        );
        const readLevel = async (
            level: typeof rootLevel,
            depth: number,
        ): Promise<void> => {
            const next = new Set<string>();
            for (const node of level) {
                const { references } = getQuerySourceParameters(
                    node.queryHistory.requestParameters,
                );
                const sources = [
                    ...new Set([
                        ...Object.values(references ?? {}),
                        ...Object.values(node.execution?.references ?? {}),
                    ]),
                ];
                nodes.set(node.queryHistory.queryUuid, {
                    queryHistory: node.queryHistory,
                    sources,
                    isDuckdbExecution: node.execution !== null,
                });
                for (const uuid of sources) {
                    if (!visited.has(uuid)) {
                        visited.add(uuid);
                        if (visited.size > maxNodes)
                            throw refuse(uuid, 'size_limit', depth + 1);
                        next.add(uuid);
                    }
                }
            }
            if (next.size === 0) return;
            if (depth >= maxDepth)
                throw refuse([...next][0], 'depth_limit', depth + 1);
            const nextLevel = await this.queryHistoryModel
                .getManyWithDuckdbExecutions([...next], projectUuid, account)
                .catch((error: unknown) => {
                    const missingNode =
                        error instanceof NotFoundError
                            ? [...next].find(
                                  (uuid) =>
                                      error.message ===
                                      `Query ${uuid} not found for project ${projectUuid}`,
                              )
                            : null;
                    return logLookupRefusal(
                        error,
                        missingNode ??
                            (next.size === 1
                                ? [...next][0]
                                : queryHistory.queryUuid),
                    );
                });
            return readLevel(nextLevel, depth + 1);
        };
        await readLevel(rootLevel, 0);

        const active = new Set<string>();
        const heights = new Map<string, number>();
        const ordered: string[] = [];
        const visit = (uuid: string, pathDepth: number): number => {
            if (active.has(uuid)) throw refuse(uuid, 'cycle');
            if (pathDepth > maxDepth)
                throw refuse(uuid, 'depth_limit', pathDepth);
            const knownHeight = heights.get(uuid);
            if (knownHeight !== undefined) {
                if (pathDepth + knownHeight > maxDepth)
                    throw refuse(uuid, 'depth_limit', pathDepth + knownHeight);
                return knownHeight;
            }
            active.add(uuid);
            let height = 0;
            for (const source of nodes.get(uuid)!.sources) {
                height = Math.max(height, 1 + visit(source, pathDepth + 1));
            }
            active.delete(uuid);
            heights.set(uuid, height);
            ordered.push(uuid);
            return height;
        };
        const enforcedNodes = new Set<string>();
        const enforce = (uuid: string) => {
            if (enforcedNodes.has(uuid)) return;
            enforcedNodes.add(uuid);
            nodes.get(uuid)!.sources.forEach(enforce);
        };
        for (const root of uniqueRoots) {
            visit(root.queryHistory.queryUuid, 0);
            if (!root.agentProducedOnly) enforce(root.queryHistory.queryUuid);
        }

        const plans = new Map<string, AiExecutionPlan | null>();
        const warehouseTypesByConnection = new Map<
            string | null,
            WarehouseTypes
        >();
        const plansByConnection = new Map<
            string | null,
            Promise<AiExecutionPlan>
        >();
        await [...nodes.values()].reduce(
            async (previous, { queryHistory: node, isDuckdbExecution }) => {
                await previous;
                const uuid = node.queryUuid;
                if (
                    !enforcedNodes.has(node.queryUuid) &&
                    !node.requestParameters?.aiSignInCredentialUuid &&
                    !isAiAccessQueryContext(node.context)
                ) {
                    plans.set(uuid, null);
                    return;
                }
                const warehouseConnectionUuid =
                    node.warehouseConnectionUuid ?? null;
                let planPromise = plansByConnection.get(
                    warehouseConnectionUuid,
                );
                if (!planPromise) {
                    planPromise = (async () => {
                        const { connection } = await this.loadConnection(
                            account,
                            projectUuid,
                            warehouseConnectionUuid,
                            'view',
                        ).catch((error: unknown) => {
                            if (
                                error instanceof NotFoundError ||
                                error instanceof ForbiddenError
                            )
                                logLineageRefusal(
                                    uuid,
                                    'connection_unavailable',
                                );
                            throw error;
                        });
                        warehouseTypesByConnection.set(
                            warehouseConnectionUuid,
                            connection.type,
                        );
                        return this.resolveEnabledPlan({
                            evaluation,
                            agentActor,
                            projectUuid,
                            organizationUuid,
                            warehouseConnectionUuid,
                            connection,
                            context: QueryExecutionContext.AI,
                            userUuid: account.user.id,
                            isRegisteredUser: account.isRegisteredUser(),
                            isServiceAccount: account.isServiceAccount(),
                        });
                    })();
                    plansByConnection.set(warehouseConnectionUuid, planPromise);
                }
                const plan = await planPromise.catch((error: unknown) => {
                    if (error instanceof AiAccessRefusedError)
                        logLineageRefusal(uuid, error.refusal.reason);
                    throw error;
                });
                const generation = getAiExecutionCredentialUuid(plan);
                if (
                    node.status === QueryHistoryStatus.READY &&
                    ((!isDuckdbExecution &&
                        this.lightdashConfig?.ai
                            ?.agentResultIdentityCheckEnabled !== false) ||
                        generation !== null) &&
                    (node.requestParameters?.aiSignInCredentialUuid ?? null) !==
                        generation
                ) {
                    this.trackQueryRefusal(
                        {
                            evaluation,
                            agentActor,
                            organizationUuid,
                            projectUuid,
                            warehouseConnectionUuid,
                            warehouseType: warehouseTypesByConnection.get(
                                warehouseConnectionUuid,
                            )!,
                            userUuid: account.user.id,
                            isRegisteredUser: account.isRegisteredUser(),
                            isServiceAccount: account.isServiceAccount(),
                        },
                        AiAccessRefusalReason.RESULT_NOT_AGENT_PRODUCED,
                        plan.identity === 'ai_service_account'
                            ? plan.inheritedFromProjectUuid
                            : null,
                    );
                    throw refuse(uuid, 'credential_generation_mismatch');
                }
                plans.set(uuid, plan);
            },
            Promise.resolve(),
        );
        for (const uuid of ordered) {
            const { queryHistory: node, sources } = nodes.get(uuid)!;
            const plan = plans.get(uuid) ?? null;
            const sourcePlans = sources.map(
                (source) => plans.get(source) ?? null,
            );
            const credentialPlan = sourcePlans.find(
                (sourcePlan) =>
                    getAiExecutionCredentialUuid(sourcePlan) !== null,
            );
            if (
                plan !== null &&
                node.status === QueryHistoryStatus.READY &&
                sourcePlans.some(
                    (sourcePlan) =>
                        getAiExecutionCredentialUuid(sourcePlan) !== null &&
                        getAiExecutionCredentialUuid(sourcePlan) !==
                            node.requestParameters?.aiSignInCredentialUuid,
                )
            ) {
                this.trackQueryRefusal(
                    {
                        evaluation,
                        agentActor,
                        organizationUuid,
                        projectUuid,
                        warehouseConnectionUuid:
                            node.warehouseConnectionUuid ?? null,
                        warehouseType: warehouseTypesByConnection.get(
                            node.warehouseConnectionUuid ?? null,
                        )!,
                        userUuid: account.user.id,
                        isRegisteredUser: account.isRegisteredUser(),
                        isServiceAccount: account.isServiceAccount(),
                    },
                    AiAccessRefusalReason.RESULT_NOT_AGENT_PRODUCED,
                    plan.identity === 'ai_service_account'
                        ? plan.inheritedFromProjectUuid
                        : null,
                );
                throw refuse(uuid, 'source_generation_mismatch');
            }
            const resolvedPlan = credentialPlan ?? plan;
            const sourceIdentities = getQueryIdentityLineage(
                sources.map((source) => nodes.get(source)!.queryHistory),
            );
            plans.set(
                uuid,
                resolvedPlan === null
                    ? null
                    : {
                          ...resolvedPlan,
                          agentIdentity: node.agentIdentity ?? null,
                          sourceIdentities,
                      },
            );
            this.logger.info('Agent result lineage', {
                queryUuid: uuid,
                projectUuid,
                agentIdentity: node.agentIdentity ?? null,
                sourceIdentities,
            });
        }
        return plans;
    }

    async getAiAccessForUser(args: AccessArgs): Promise<AiAccessForUser> {
        const enabled = await this.isEnabled(args);
        const rule = enabled
            ? await this.organizationAgentIdentityRulesModel.get(
                  args.organizationUuid,
                  args.connection.type,
                  this.actorKind(args),
              )
            : null;
        const result: AiAccessForUser = {
            requirementSource:
                rule && rule.source !== 'marked_person' ? 'organization' : null,
            source: rule?.source ?? null,
            identity: enabled ? 'marked_person' : null,
            marker: enabled ? describeAgentMarker(args.connection.type) : null,
            projectUuid: args.projectUuid,
            warehouseConnectionUuid: args.warehouseConnectionUuid,
            enabled,
            principalKind: enabled ? this.actorKind(args) : null,
            refusal: null,
            expiresAt: null,
            principalName: null,
        };
        if (!rule || rule.source === 'marked_person') return result;
        try {
            if (!args.isRegisteredUser && !args.isServiceAccount) {
                throw new AiAccessRefusedError(
                    AiAccessRefusalReason.EMBED_NOT_SUPPORTED,
                );
            }
            switch (rule.source) {
                case 'ai_service_account': {
                    result.identity = 'ai_service_account';
                    result.principalKind = 'service_account';
                    const resolved = await this.slotResolver.resolveMetadata({
                        projectUuid: args.projectUuid,
                        connection: args.warehouseConnectionUuid,
                    });
                    const slot = resolved?.slot ?? null;
                    if (slot === null) {
                        throw new AiAccessRefusedError(
                            AiAccessRefusalReason.AI_SERVICE_ACCOUNT_MISSING,
                        );
                    }
                    if (
                        slot.warehouseType !== WarehouseTypes.BIGQUERY ||
                        slot.method !== 'private_key'
                    ) {
                        throw new AiAccessRefusedError(
                            AiAccessRefusalReason.AI_SERVICE_ACCOUNT_INVALID,
                        );
                    }
                    return result;
                }
                case 'agent_sign_in': {
                    result.identity = 'connected_person';
                    const provider = await this.provider(args);
                    const { email } = await this.userModel.getUserDetailsByUuid(
                        args.userUuid,
                    );
                    if (!email)
                        throw new UnexpectedServerError(
                            'AI access needs the person to have an email address',
                        );
                    const missing = await provider.missingPrerequisite({
                        connection: args.connection,
                        person: {
                            organizationUuid: args.organizationUuid,
                            userUuid: args.userUuid,
                            email,
                        },
                        silentRefresh: await this.isSilentRefreshEnabled(
                            args,
                            provider.warehouseType,
                        ),
                    });
                    if (missing !== null) {
                        throw new AiAccessRefusedError(missing);
                    }
                    const credential =
                        await this.userWarehouseCredentialsModel.findAiCredentialWithSecrets(
                            {
                                userUuid: args.userUuid,
                                warehouseType: args.connection.type,
                            },
                        );
                    result.expiresAt = credential?.expiresAt ?? null;
                    result.principalName = credential ? email : null;
                    break;
                }
                default:
                    assertUnreachable(
                        rule.source,
                        'Unknown AI identity source',
                    );
            }
        } catch (error) {
            if (!(error instanceof AiAccessRefusedError)) throw error;
            const refusalError = this.withRefusalUrls(
                error,
                args.projectUuid,
                AgentIdentityConnectEntryPoint.UNKNOWN,
            );
            this.logRefusal(
                args,
                refusalError,
                'debug',
                refusalError.inheritedFromProjectUuid,
            );
            result.refusal = refusalError.refusal;
        }
        return result;
    }
}
