import { subject } from '@casl/ability';
import {
    AlreadyExistsError,
    ApiConnectorType,
    assertRegisteredAccount,
    assertUnreachable,
    DATA_APP_VIZ_TEMPLATE,
    EXPLORE_PREFIX_MAX_LENGTH,
    EXTERNAL_CONNECTION_DEFAULTS,
    EXTERNAL_CONNECTION_IDENTITY_HEADERS,
    FeatureFlags,
    ForbiddenError,
    getDefaultExplorePrefix,
    getErrorMessage,
    getExplorePrefixError,
    getItemId,
    isJwtUser,
    LIVE_SOURCE_AI_HINT_MAX_LENGTH,
    MissingConfigError,
    NotFoundError,
    ParameterError,
    POSTHOG_REGION_ORIGINS,
    TimeoutError,
    TooManyRequestsError,
    UnexpectedServerError,
    WarehouseConnectionError,
    type Account,
    type ApiSaveExternalConnectionSampleRequest,
    type ApiSourceSchemaScan,
    type CreateExternalConnection,
    type ExplorePrefixCheck,
    type ExternalConnection,
    type ExternalConnectionApiSource,
    type ExternalConnectionApiUsage,
    type ExternalConnectionAuthType,
    type ExternalConnectionConfigProposal,
    type ExternalConnectionLinkedApps,
    type ExternalConnectionListItem,
    type ExternalConnectionMethod,
    type ExternalConnectionSample,
    type ExternalConnectionSampleRequest,
    type ExternalFetchRequest,
    type ExternalFetchResponse,
    type GoogleLiveSourceChoice,
    type GoogleLiveSourcePendingChoice,
    type LiveSourceFieldChange,
    type LiveSourceFieldEditor,
    type LiveSourceFields,
    type QuerySourceSchemaTable,
    type ReattachableLiveSource,
    type RegisteredAccount,
    type UpdateExternalConnection,
} from '@lightdash/common';
import { groupBy, isEqual, sortBy, uniqBy } from 'es-toolkit/compat';
import { createHash, randomBytes } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { LightdashAnalytics } from '../../../analytics/LightdashAnalytics';
import { toSessionUser } from '../../../auth/account';
import { type LightdashConfig } from '../../../config/parseConfig';
import { type AppModel } from '../../../models/AppModel';
import type { FeatureFlagModel } from '../../../models/FeatureFlagModel/FeatureFlagModel';
import type { ProjectModel } from '../../../models/ProjectModel/ProjectModel';
import type { SavedChartModel } from '../../../models/SavedChartModel';
import { BaseService } from '../../../services/BaseService';
import type {
    ApiConnector,
    ApiConnectorTransport,
    ApiConnectorUsage,
    MeteredApiConnector,
} from '../../../services/QuerySourceService/api/ApiConnector';
import {
    buildApiSourceExplores,
    describeApiSourceTarget,
    getApiSourceDefinitionHashes,
    getApiSourceExploreName,
    getApiSourceExploreNames,
    getApiSourceReservedExploreNames,
    getApiSourceWideDefinition,
    getLegacyLiveSourceName,
    getLostApiSourceFieldIds,
    toScannedLiveSourceFields,
} from '../../../services/QuerySourceService/api/apiSourceExplores';
import { type ApiSourceScan } from '../../../services/QuerySourceService/api/ApiSourceIntegration';
import { getApiSourceIntegration } from '../../../services/QuerySourceService/api/apiSourceIntegrations';
import { GOOGLE_TOKEN_URL } from '../../../services/QuerySourceService/api/google/googleSignIn';
import {
    getLinkedInAdsAccountPath,
    LINKEDIN_ADS_ORIGIN,
    LINKEDIN_ADS_REQUEST_HEADERS,
    LINKEDIN_ADS_TOKEN_URL,
} from '../../../services/QuerySourceService/api/linkedin/LinkedInAdsConnector';
import {
    applyLiveSourceFieldChanges,
    getInitialLiveSourceFieldEdits,
    getRequiredFieldNames,
    listLiveSourceFields,
} from '../../../services/QuerySourceService/api/liveSourceFields';
import { getPostHogOAuthEndpoints } from '../../../services/QuerySourceService/api/posthog/PostHogConnector';
import {
    scanPostHogSchema,
    toFailedScan,
    toPostHogSchemaTable,
} from '../../../services/QuerySourceService/api/posthog/postHogSchemaScan';
import type { SpacePermissionService } from '../../../services/SpaceService/SpacePermissionService';
import {
    normalizeCredentialUrlHref,
    normalizeCredentialUrlOrigin,
} from '../../../utils/credentialDestination';
import type { EncryptionUtil } from '../../../utils/EncryptionUtil/EncryptionUtil';
import {
    secureFetch,
    SecureFetchError,
    type AllowedPrivateHostCidrs,
} from '../../../utils/secureFetch/secureFetch';
import {
    type DeletedLiveSource,
    type ExternalConnectionModel,
} from '../../models/ExternalConnectionModel';
import { type CommercialSchedulerClient } from '../../scheduler/SchedulerClient';
import { generateExternalConnectionConfigProposal } from '../ai/agents/externalConnectionConfigGenerator';
import { getModel } from '../ai/models';
import { type GeneratorModelOptions } from '../ai/models/types';
import { type OrgAiCopilotConfigResolver } from '../ai/OrgAiCopilotConfigResolver';
import {
    assertCanViewApp,
    assertCanViewEmbeddedApp,
    type DataAppProjectContext,
} from '../AppGenerateService/appAuthz';
import { type AppGenerateService } from '../AppGenerateService/AppGenerateService';
import { type EmbedService } from '../EmbedService/EmbedService';
import { ApiSourceCallLimiter } from './ApiSourceCallLimiter';
import {
    validateApiSourceConnection,
    withApiSourceAccessRules,
} from './apiSourceConnection';
import { getExternalConnectionSubject } from './externalConnectionAuthz';
import {
    validateExternalConnectionConfig,
    validateServiceAccountKeyfile,
} from './externalConnectionConfigValidation';
import {
    buildGoogleAuthorizeUrl,
    GOOGLE_CONNECTORS,
    isGoogleConnector,
    type GoogleApi,
    type GoogleConnectorType,
} from './googleOAuth';
import { type GoogleServiceAccountTokenProvider } from './GoogleServiceAccountTokenProvider';
import {
    buildLinkedInAdsAuthorizeUrl,
    getLinkedInAdsOAuthRedirectUri,
} from './linkedInAdsOAuth';
import {
    isAccessTokenFresh,
    OAuthGrantRejectedError,
    parseStoredOAuthTokens,
    serializeStoredOAuthTokens,
    type OAuthAuthorizationCodeClientConfig,
    type OAuthAuthorizationCodeTokenClient,
    type StoredOAuthTokens,
} from './OAuthAuthorizationCodeTokenClient';
import {
    type OAuthClientCredentialsConfig,
    type OAuthClientCredentialsTokenProvider,
} from './OAuthClientCredentialsTokenProvider';
import {
    buildPostHogAuthorizeUrl,
    getPostHogClientMetadata,
    getPostHogGrantedProjectId,
    getPostHogOAuthRedirectUri,
} from './postHogOAuth';
import {
    assertSafeApiKeyHeaderName,
    buildOutboundUrl,
    computeMinuteWindow,
    filterExternalResponseHeaders,
    normalizeAndValidatePath,
    serializeRequestBody,
    validateCustomHeaders,
} from './proxyValidation';

type ExternalConnectionServiceArguments = {
    allowedPrivateHostCidrs: AllowedPrivateHostCidrs;
    analytics: LightdashAnalytics;
    externalConnectionModel: ExternalConnectionModel;
    appModel: AppModel;
    appGenerateService: AppGenerateService;
    embedService: EmbedService;
    spacePermissionService: SpacePermissionService;
    googleTokenProvider: GoogleServiceAccountTokenProvider;
    oauthClientCredentialsTokenProvider: OAuthClientCredentialsTokenProvider;
    oauthAuthorizationCodeTokenClient: OAuthAuthorizationCodeTokenClient;
    orgAiCopilotConfigResolver: OrgAiCopilotConfigResolver;
    featureFlagModel: FeatureFlagModel;
    schedulerClient: Pick<CommercialSchedulerClient, 'scanApiSourceSchema'>;
    savedChartModel: Pick<
        SavedChartModel,
        'getChartCountPerField' | 'getChartCountForExplores'
    >;
    projectModel: Pick<
        ProjectModel,
        | 'replaceApiSourceExplores'
        | 'deleteApiSourceExplores'
        | 'findExploreNamesTakenByOthers'
        | 'hasApiSourceExplores'
        | 'listApiSourceExploreHashes'
        | 'getApiSourceFieldIds'
    >;
    encryptionUtil: Pick<EncryptionUtil, 'encrypt' | 'decrypt'>;
    lightdashConfig: Pick<LightdashConfig, 'siteUrl' | 'liveSources' | 'auth'>;
};

export type PostHogRegion = keyof typeof POSTHOG_REGION_ORIGINS;

/** The page a live-source sign-in returns to; a closed set, so it cannot redirect off-site. */
export type LiveSourceReturnTo = 'settings' | 'onboarding';

export const parseLiveSourceReturnTo = (
    value: string | undefined,
): LiveSourceReturnTo => (value === 'onboarding' ? 'onboarding' : 'settings');
// How many numbered alternatives to try when suggesting a free explore prefix.
const MAX_EXPLORE_PREFIX_SUGGESTIONS = 20;
const LINKEDIN_AD_ACCOUNT_ID = /^\d{1,20}$/;

/** What the sign-in callback needs from the request that started it. */
export type PostHogOAuthSession = {
    projectUuid: string;
    region: PostHogRegion;
    name: string;
    explorePrefix?: string;
    connectionUuid: string | null;
    clientId: string;
    redirectUri: string;
    codeVerifier: string;
};

/** What the LinkedIn sign-in callback needs from the request that started it. */
export type LinkedInAdsOAuthSession = {
    projectUuid: string;
    name: string;
    adAccountId: string;
    connectionUuid: string | null;
    clientId: string;
    redirectUri: string;
};

/** What the Google sign-in callback needs from the request that started it. */
export type GoogleOAuthSession = {
    projectUuid: string;
    connector: GoogleConnectorType;
    name: string;
    explorePrefix?: string;
    connectionUuid: string | null;
    redirectUri: string;
    codeVerifier: string;
};

/** A Google sign-in that can read several properties, waiting for the admin to pick one. */
export type PendingGoogleLiveSource = {
    projectUuid: string;
    connector: GoogleConnectorType;
    name: string;
    explorePrefix?: string;
    /** The granted tokens, encrypted while they wait in the session. */
    encryptedTokens: string;
    choices: GoogleLiveSourceChoice[];
};

const GOOGLE_API_TIMEOUT_MS = 10_000;
const GOOGLE_API_RESPONSE_MAX_BYTES = 1024 * 1024;
const LINKEDIN_ACCOUNT_CHECK_TIMEOUT_MS = 10_000;
const LINKEDIN_ACCOUNT_CHECK_MAX_BYTES = 1024 * 1024;

export class ExternalConnectionService extends BaseService {
    private readonly allowedPrivateHostCidrs: AllowedPrivateHostCidrs;

    private readonly analytics: LightdashAnalytics;

    private readonly externalConnectionModel: ExternalConnectionModel;

    private readonly appModel: AppModel;

    private readonly appGenerateService: AppGenerateService;

    private readonly embedService: EmbedService;

    private readonly spacePermissionService: SpacePermissionService;

    private readonly googleTokenProvider: GoogleServiceAccountTokenProvider;

    private readonly oauthClientCredentialsTokenProvider: OAuthClientCredentialsTokenProvider;

    private readonly oauthAuthorizationCodeTokenClient: OAuthAuthorizationCodeTokenClient;

    private readonly lightdashConfig: Pick<
        LightdashConfig,
        'siteUrl' | 'liveSources' | 'auth'
    >;

    private readonly encryptionUtil: Pick<
        EncryptionUtil,
        'encrypt' | 'decrypt'
    >;

    private readonly apiSourceCallLimiter: ApiSourceCallLimiter;

    private readonly orgAiCopilotConfigResolver: OrgAiCopilotConfigResolver;

    private readonly featureFlagModel: FeatureFlagModel;

    private readonly schedulerClient: ExternalConnectionServiceArguments['schedulerClient'];
    private readonly projectModel: ExternalConnectionServiceArguments['projectModel'];

    private readonly savedChartModel: ExternalConnectionServiceArguments['savedChartModel'];

    private static readonly DEFAULT_RATE_LIMIT_PER_MINUTE = 60;

    private static readonly MAX_PROPOSAL_DESCRIPTION_CHARS = 2_000;

    constructor(args: ExternalConnectionServiceArguments) {
        super();
        this.allowedPrivateHostCidrs = args.allowedPrivateHostCidrs;
        this.analytics = args.analytics;
        this.externalConnectionModel = args.externalConnectionModel;
        this.appModel = args.appModel;
        this.appGenerateService = args.appGenerateService;
        this.embedService = args.embedService;
        this.spacePermissionService = args.spacePermissionService;
        this.googleTokenProvider = args.googleTokenProvider;
        this.oauthClientCredentialsTokenProvider =
            args.oauthClientCredentialsTokenProvider;
        this.oauthAuthorizationCodeTokenClient =
            args.oauthAuthorizationCodeTokenClient;
        this.lightdashConfig = args.lightdashConfig;
        this.encryptionUtil = args.encryptionUtil;
        this.apiSourceCallLimiter = new ApiSourceCallLimiter({
            model: args.externalConnectionModel,
        });
        this.orgAiCopilotConfigResolver = args.orgAiCopilotConfigResolver;
        this.featureFlagModel = args.featureFlagModel;
        this.schedulerClient = args.schedulerClient;
        this.projectModel = args.projectModel;
        this.savedChartModel = args.savedChartModel;
    }

    private async assertLiveSourcesEnabled(
        account: RegisteredAccount,
    ): Promise<void> {
        const { enabled } = await this.featureFlagModel.get({
            user: {
                userUuid: account.user.id,
                organizationUuid: account.organization.organizationUuid,
            },
            featureFlagId: FeatureFlags.ApiQuerySources,
        });
        if (!enabled) {
            throw new ForbiddenError(
                'Live data sources are not enabled for this organization',
            );
        }
    }

    private async isNewOnboardingEnabled(
        account: RegisteredAccount,
    ): Promise<boolean> {
        const { enabled } = await this.featureFlagModel.get({
            user: {
                userUuid: account.user.id,
                organizationUuid: account.organization.organizationUuid,
            },
            featureFlagId: FeatureFlags.NewOnboarding,
        });
        return enabled;
    }

    private static assertNotSignInType(type: ExternalConnectionAuthType) {
        if (type === 'oauth_authorization_code') {
            throw new ParameterError(
                'Signed-in connections are set up by signing in from Live data sources',
            );
        }
    }

    private assertCanManage(
        account: RegisteredAccount,
        projectUuid: string,
        organizationUuid: string,
    ): void {
        const ability = this.createAuditedAbility(account);
        if (
            ability.cannot(
                'manage',
                getExternalConnectionSubject({
                    organizationUuid,
                    projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError(
                'You do not have permission to manage external connections',
            );
        }
    }

    private assertCanView(
        account: RegisteredAccount,
        connection: Pick<
            ExternalConnection,
            'organizationUuid' | 'projectUuid' | 'allowDataAppBuilderLinking'
        >,
        errorMessage = 'You do not have permission to view this external connection',
    ): void {
        const ability = this.createAuditedAbility(account);
        if (ability.cannot('view', getExternalConnectionSubject(connection))) {
            throw new ForbiddenError(errorMessage);
        }
    }

    private async getDataAppProjectContext(
        projectUuid: string,
    ): Promise<DataAppProjectContext> {
        const context =
            await this.externalConnectionModel.findProjectAbilityContext(
                projectUuid,
            );
        if (!context) {
            throw new NotFoundError('Project not found');
        }
        return { ...context, projectUuid };
    }

    /**
     * Loads the app row and asserts the caller can `manage` the DataApp,
     * mirroring AppGenerateService's assertCanManageApp pattern (space
     * context + createdByUserUuid). Returns the app row for downstream use.
     */
    private async assertCanManageApp(
        account: RegisteredAccount,
        appUuid: string,
    ): Promise<{
        app_id: string;
        project_uuid: string;
        space_uuid: string | null;
        created_by_user_uuid: string;
        organization_uuid: string;
    }> {
        const app = await this.externalConnectionModel.findApp(appUuid);
        if (!app) {
            throw new NotFoundError('Data app not found');
        }

        const spaceContext = app.space_uuid
            ? await this.spacePermissionService.resolveAccess(account.user.id, {
                  type: 'space',
                  spaceUuid: app.space_uuid,
              })
            : {};
        const projectContext = await this.getDataAppProjectContext(
            app.project_uuid,
        );

        const ability = this.createAuditedAbility(account);
        if (
            ability.cannot(
                'manage',
                subject('DataApp', {
                    ...projectContext,
                    createdByUserUuid: app.created_by_user_uuid,
                    ...spaceContext,
                }),
            )
        ) {
            throw new ForbiddenError(
                'You do not have permission to manage this data app',
            );
        }
        return app;
    }

    async create(
        account: RegisteredAccount,
        projectUuid: string,
        data: CreateExternalConnection,
        // Forced slug is only used by content-as-code upserts; the public
        // CRUD API always generates one from the name.
        options?: { slug?: string },
    ): Promise<ExternalConnection> {
        // Derive the org from the project — never trust the caller's org — so an
        // org admin cannot create a connection against another org's project.
        const organizationUuid =
            await this.externalConnectionModel.getProjectOrganizationUuid(
                projectUuid,
            );
        if (!organizationUuid) {
            throw new NotFoundError('Project not found');
        }
        this.assertCanManage(account, projectUuid, organizationUuid);
        if (data.apiSource) await this.assertLiveSourcesEnabled(account);
        ExternalConnectionService.assertNotSignInType(data.type);
        const config = withApiSourceAccessRules(data);
        validateExternalConnectionConfig(config, Boolean(config.secret));
        validateApiSourceConnection(config);
        if (config.type === 'google_service_account' && config.secret) {
            validateServiceAccountKeyfile(config.secret);
        }
        const explorePrefix = await this.resolveNewExplorePrefix(
            projectUuid,
            config,
        );
        const connection = await this.holdExplorePrefix(
            await this.externalConnectionModel.create(
                projectUuid,
                organizationUuid,
                account.user.id,
                config,
                options,
            ),
            explorePrefix,
        );
        this.analytics.track({
            event: 'external_connection.created',
            userId: account.user.id,
            properties: {
                organizationId: organizationUuid,
                projectId: projectUuid,
                externalConnectionUuid: connection.externalConnectionUuid,
                ...ExternalConnectionService.kindProperties(connection),
                authType: connection.type,
            },
        });
        await this.scheduleApiSourceSchemaScan(account, connection);
        await this.syncApiSourceExploresAfterChange(
            account,
            connection,
            'useBaseLayer',
        );
        return connection;
    }

    async list(
        account: RegisteredAccount,
        projectUuid: string,
    ): Promise<ExternalConnectionListItem[]> {
        // Derive the org from the project, not the caller, and filter by both,
        // so an org admin cannot list another org's project's connections.
        const organizationUuid =
            await this.externalConnectionModel.getProjectOrganizationUuid(
                projectUuid,
            );
        if (!organizationUuid) {
            throw new NotFoundError('Project not found');
        }
        const ability = this.createAuditedAbility(account);
        if (
            ability.cannot(
                'view',
                getExternalConnectionSubject({
                    organizationUuid,
                    projectUuid,
                    allowDataAppBuilderLinking: true,
                }),
            )
        ) {
            throw new ForbiddenError(
                'You do not have permission to view external connections',
            );
        }

        const connections = await this.externalConnectionModel.list(
            projectUuid,
            organizationUuid,
            { kind: null },
        );
        return connections.filter((connection) =>
            ability.can('view', getExternalConnectionSubject(connection)),
        );
    }

    async listLinkedApps(
        account: RegisteredAccount,
        projectUuid: string,
        connectionUuid: string,
    ): Promise<ExternalConnectionLinkedApps> {
        await this.getOwnedConnection(account, projectUuid, connectionUuid);
        return this.externalConnectionModel.listLinkedApps(connectionUuid);
    }

    private async loadConnection(
        projectUuid: string,
        connectionUuid: string,
    ): Promise<ExternalConnection> {
        const connection =
            await this.externalConnectionModel.findByUuid(connectionUuid);
        if (!connection || connection.projectUuid !== projectUuid) {
            throw new NotFoundError('External connection not found');
        }
        return connection;
    }

    private async getOwnedConnection(
        account: RegisteredAccount,
        projectUuid: string,
        connectionUuid: string,
    ): Promise<ExternalConnection> {
        const connection = await this.loadConnection(
            projectUuid,
            connectionUuid,
        );
        this.assertCanManage(
            account,
            connection.projectUuid,
            connection.organizationUuid,
        );
        return connection;
    }

    private async getViewableConnection(
        account: RegisteredAccount,
        projectUuid: string,
        connectionUuid: string,
    ): Promise<ExternalConnection> {
        const connection = await this.loadConnection(
            projectUuid,
            connectionUuid,
        );
        this.assertCanView(account, connection);
        return connection;
    }

    private async getLinkableConnection(
        account: RegisteredAccount,
        projectUuid: string,
        connectionUuid: string,
    ): Promise<ExternalConnection> {
        const connection = await this.loadConnection(
            projectUuid,
            connectionUuid,
        );
        this.assertCanView(
            account,
            connection,
            'You do not have permission to link this external connection',
        );
        return connection;
    }

    async get(
        account: RegisteredAccount,
        projectUuid: string,
        connectionUuid: string,
    ): Promise<ExternalConnection> {
        return this.getViewableConnection(account, projectUuid, connectionUuid);
    }

    private static kindProperties(
        connection: Pick<ExternalConnection, 'kind' | 'apiSource'>,
    ) {
        return {
            connectionKind: connection.kind ?? 'data_app',
            connector: connection.apiSource?.connector ?? null,
        };
    }

    private static resolveConnectionUpdate(
        existing: ExternalConnection,
        data: UpdateExternalConnection,
    ): ExternalConnection {
        const resultingType = data.type ?? existing.type;
        const typeChanged =
            data.type !== undefined && data.type !== existing.type;
        const originChanged =
            data.origin !== undefined &&
            normalizeCredentialUrlOrigin(data.origin) !==
                normalizeCredentialUrlOrigin(existing.origin);
        const keepsOAuthClientCredentialsType =
            existing.type === 'oauth_client_credentials' &&
            resultingType === 'oauth_client_credentials';
        const oauthTokenUrlChanged =
            keepsOAuthClientCredentialsType &&
            data.oauthTokenUrl !== undefined &&
            normalizeCredentialUrlHref(data.oauthTokenUrl ?? '') !==
                normalizeCredentialUrlHref(existing.oauthTokenUrl ?? '');
        const oauthClientIdChanged =
            keepsOAuthClientCredentialsType &&
            data.oauthClientId !== undefined &&
            data.oauthClientId !== existing.oauthClientId;

        // A stored secret is valid only for its current auth type and credential
        // destinations. Changing one requires the caller to supply a new one.
        let hasSecretAfter: boolean;
        if (data.secret === null) {
            hasSecretAfter = false;
        } else if (data.secret) {
            hasSecretAfter = true;
        } else {
            hasSecretAfter =
                !typeChanged &&
                !originChanged &&
                !oauthTokenUrlChanged &&
                !oauthClientIdChanged &&
                existing.hasSecret;
        }

        // Type-specific fields never carry across auth type changes and are
        // cleared when they do not belong to the resulting type.
        const resolveTypeField = <T>(
            belongsToResultingType: boolean,
            patchValue: T | undefined,
            existingValue: T,
        ): T | null => {
            if (!belongsToResultingType) return null;
            if (patchValue !== undefined) return patchValue;
            return typeChanged ? null : existingValue;
        };
        const apiKeyName = resolveTypeField(
            resultingType === 'api_key',
            data.apiKeyName,
            existing.apiKeyName,
        );
        const apiKeyLocation = resolveTypeField(
            resultingType === 'api_key',
            data.apiKeyLocation,
            existing.apiKeyLocation,
        );
        const oauthScopes = resolveTypeField(
            resultingType === 'google_service_account' ||
                resultingType === 'oauth_client_credentials',
            data.oauthScopes,
            existing.oauthScopes,
        );
        const usesOAuthClient =
            resultingType === 'oauth_client_credentials' ||
            resultingType === 'oauth_authorization_code';
        const oauthTokenUrl = resolveTypeField(
            usesOAuthClient,
            data.oauthTokenUrl,
            existing.oauthTokenUrl,
        );
        const oauthClientId = resolveTypeField(
            usesOAuthClient,
            data.oauthClientId,
            existing.oauthClientId,
        );
        const oauthClientAuthMethod = resolveTypeField(
            resultingType === 'oauth_client_credentials',
            data.oauthClientAuthMethod,
            existing.oauthClientAuthMethod,
        );

        const resolved = withApiSourceAccessRules<ExternalConnection>({
            ...existing,
            name: data.name ?? existing.name,
            type: resultingType,
            origin: data.origin ?? existing.origin,
            allowBrowserImages:
                data.allowBrowserImages ?? existing.allowBrowserImages,
            allowDataAppBuilderLinking:
                data.allowDataAppBuilderLinking ??
                existing.allowDataAppBuilderLinking,
            forwardUserIdentity:
                data.forwardUserIdentity ??
                existing.forwardUserIdentity ??
                false,
            instructions:
                data.instructions !== undefined
                    ? data.instructions
                    : existing.instructions,
            allowedPathPrefixes:
                data.allowedPathPrefixes ?? existing.allowedPathPrefixes,
            allowedMethods: data.allowedMethods ?? existing.allowedMethods,
            allowedContentTypes:
                data.allowedContentTypes ?? existing.allowedContentTypes,
            responseMaxBytes:
                data.responseMaxBytes ?? existing.responseMaxBytes,
            requestMaxBytes: data.requestMaxBytes ?? existing.requestMaxBytes,
            timeoutMs: data.timeoutMs ?? existing.timeoutMs,
            rateLimitPerMinute:
                data.rateLimitPerMinute !== undefined
                    ? data.rateLimitPerMinute
                    : existing.rateLimitPerMinute,
            apiKeyName,
            apiKeyLocation,
            oauthScopes,
            oauthTokenUrl,
            oauthClientId,
            oauthClientAuthMethod,
            customHeaders:
                data.customHeaders !== undefined
                    ? data.customHeaders
                    : existing.customHeaders,
            apiSource:
                data.apiSource !== undefined
                    ? data.apiSource
                    : (existing.apiSource ?? null),
            hasSecret: hasSecretAfter,
        });

        validateExternalConnectionConfig(resolved, hasSecretAfter);
        validateApiSourceConnection(resolved);
        // A secret-less same-type update keeps the already-validated stored
        // keyfile; only a replacement keyfile needs parsing again.
        if (resultingType === 'google_service_account' && data.secret) {
            validateServiceAccountKeyfile(data.secret);
        }

        return resolved;
    }

    async update(
        account: RegisteredAccount,
        projectUuid: string,
        connectionUuid: string,
        data: UpdateExternalConnection,
    ): Promise<ExternalConnection> {
        const existing = await this.getOwnedConnection(
            account,
            projectUuid,
            connectionUuid,
        );
        const isLiveSource = existing.kind === 'live_source';
        if (isLiveSource || data.apiSource) {
            await this.assertLiveSourcesEnabled(account);
        }
        if (!isLiveSource && data.apiSource) {
            throw new ParameterError(
                'A data app connection cannot become a live data source',
            );
        }
        if (isLiveSource && data.apiSource === null) {
            throw new ParameterError(
                'A live data source cannot drop its integration settings',
            );
        }
        if (data.aiHint !== undefined && !isLiveSource) {
            throw new ParameterError('Only live data sources have an AI hint');
        }
        const aiHint =
            data.aiHint?.trim() ||
            (data.aiHint === undefined ? undefined : null);
        if ((aiHint?.length ?? 0) > LIVE_SOURCE_AI_HINT_MAX_LENGTH) {
            throw new ParameterError(
                `The AI hint can be at most ${LIVE_SOURCE_AI_HINT_MAX_LENGTH} characters`,
            );
        }
        if (data.type !== undefined && data.type !== existing.type) {
            ExternalConnectionService.assertNotSignInType(data.type);
        }
        if (
            existing.type === 'oauth_authorization_code' &&
            (data.type ?? existing.type) === existing.type &&
            (data.secret !== undefined ||
                data.oauthTokenUrl !== undefined ||
                data.oauthClientId !== undefined ||
                (data.origin !== undefined &&
                    data.origin !== existing.origin) ||
                (data.apiSource !== undefined &&
                    !isEqual(data.apiSource, existing.apiSource)))
        ) {
            throw new ParameterError(
                'Reconnect this source to change its sign-in, region, project or site',
            );
        }
        const resolved = ExternalConnectionService.resolveConnectionUpdate(
            existing,
            data,
        );
        // Persist the resolved type-specific fields so foreign fields (and the
        // stale scopes/api-key config) are cleared when the type changes.
        const updated = await this.externalConnectionModel.update(
            connectionUuid,
            account.user.id,
            {
                ...data,
                aiHint,
                apiKeyName: resolved.apiKeyName,
                apiKeyLocation: resolved.apiKeyLocation,
                oauthScopes: resolved.oauthScopes,
                oauthTokenUrl: resolved.oauthTokenUrl,
                oauthClientId: resolved.oauthClientId,
                oauthClientAuthMethod: resolved.oauthClientAuthMethod,
                ...(resolved.apiSource
                    ? {
                          allowedPathPrefixes: resolved.allowedPathPrefixes,
                          allowedMethods: resolved.allowedMethods,
                          allowedContentTypes: resolved.allowedContentTypes,
                          timeoutMs: resolved.timeoutMs,
                          responseMaxBytes: resolved.responseMaxBytes,
                      }
                    : {}),
            },
        );
        this.analytics.track({
            event: 'external_connection.updated',
            userId: account.user.id,
            properties: {
                organizationId: existing.organizationUuid,
                projectId: projectUuid,
                externalConnectionUuid: connectionUuid,
                ...ExternalConnectionService.kindProperties(updated),
            },
        });
        if (
            data.secret !== undefined ||
            !isEqual(updated.apiSource, existing.apiSource)
        ) {
            await this.scheduleApiSourceSchemaScan(account, updated);
        }
        const { aiHint: _aiHint, ...settings } = data;
        const changesOnlyHint =
            data.aiHint !== undefined &&
            Object.entries(settings).every(
                ([key, value]) =>
                    value === undefined ||
                    isEqual(value, existing[key as keyof ExternalConnection]),
            );
        if (changesOnlyHint && updated.apiSource) {
            await this.rebuildAfterHintChange(updated, updated.apiSource);
            return updated;
        }
        // Same target and a saved scan: a failing scan can't hold back a rename
        const hasSavedScan =
            isLiveSource &&
            isEqual(updated.apiSource, existing.apiSource) &&
            (
                await this.externalConnectionModel.getLiveSourceFieldState(
                    connectionUuid,
                )
            ).lastScan !== null;
        await this.syncApiSourceExploresAfterChange(
            account,
            updated,
            hasSavedScan ? 'useBaseLayer' : 'throw',
        );
        return updated;
    }

    /** A hint needs no scan. It reaches the prompt either way, so a failed rebuild only logs. */
    private async rebuildAfterHintChange(
        connection: ExternalConnection,
        apiSource: ExternalConnectionApiSource,
    ): Promise<void> {
        try {
            await this.rebuildApiSourceExplores(connection, apiSource);
        } catch (error) {
            this.logger.error(
                `Failed to rebuild live data source ${connection.externalConnectionUuid} after a hint change: ${getErrorMessage(error)}`,
            );
        }
    }

    async delete(
        account: RegisteredAccount,
        projectUuid: string,
        connectionUuid: string,
    ): Promise<void> {
        const existing = await this.getOwnedConnection(
            account,
            projectUuid,
            connectionUuid,
        );
        await this.externalConnectionModel.softDelete(connectionUuid);
        if (existing.kind === 'live_source') {
            await this.projectModel.deleteApiSourceExplores(
                projectUuid,
                connectionUuid,
            );
        }
        this.analytics.track({
            event: 'external_connection.deleted',
            userId: account.user.id,
            properties: {
                organizationId: existing.organizationUuid,
                projectId: projectUuid,
                externalConnectionUuid: connectionUuid,
                ...ExternalConnectionService.kindProperties(existing),
            },
        });
    }

    async rotateSecret(
        account: RegisteredAccount,
        projectUuid: string,
        connectionUuid: string,
        secret: string,
    ): Promise<ExternalConnection> {
        const existing = await this.getOwnedConnection(
            account,
            projectUuid,
            connectionUuid,
        );
        ExternalConnectionService.assertNotSignInType(existing.type);
        await this.externalConnectionModel.rotateSecret(connectionUuid, secret);
        this.analytics.track({
            event: 'external_connection.secret_rotated',
            userId: account.user.id,
            properties: {
                organizationId: existing.organizationUuid,
                projectId: projectUuid,
                externalConnectionUuid: connectionUuid,
            },
        });
        return this.getOwnedConnection(account, projectUuid, connectionUuid);
    }

    async listAppLinks(
        account: RegisteredAccount,
        projectUuid: string,
        appUuid: string,
    ): Promise<Array<{ alias: string; connection: ExternalConnection }>> {
        const app = await this.assertCanManageApp(account, appUuid);
        if (app.project_uuid !== projectUuid) {
            throw new NotFoundError('Data app not found');
        }
        return this.externalConnectionModel.listAppLinks(app.app_id);
    }

    async linkToApp(
        account: RegisteredAccount,
        projectUuid: string,
        appUuid: string,
        externalConnectionUuid: string,
        alias: string,
    ): Promise<void> {
        const app = await this.assertCanManageApp(account, appUuid);
        if (app.project_uuid !== projectUuid) {
            throw new NotFoundError('Data app not found');
        }
        if (!/^[a-z0-9_-]+$/i.test(alias) || alias.length > 64) {
            throw new ParameterError(
                'Alias must contain only letters, numbers, hyphens, and underscores (max 64 chars)',
            );
        }
        const connection = await this.getLinkableConnection(
            account,
            projectUuid,
            externalConnectionUuid,
        );
        await this.externalConnectionModel.linkToApp(
            app.app_id,
            externalConnectionUuid,
            alias,
        );
        this.analytics.track({
            event: 'external_connection.linked',
            userId: account.user.id,
            properties: {
                organizationId: connection.organizationUuid,
                projectId: projectUuid,
                externalConnectionUuid,
                appUuid,
                alias,
            },
        });
    }

    async unlinkFromApp(
        account: RegisteredAccount,
        projectUuid: string,
        appUuid: string,
        alias: string,
    ): Promise<void> {
        const app = await this.assertCanManageApp(account, appUuid);
        if (app.project_uuid !== projectUuid) {
            throw new NotFoundError('Data app not found');
        }
        const links = await this.externalConnectionModel.listAppLinks(
            app.app_id,
        );
        const link = links.find((l) => l.alias === alias);
        if (!link) {
            throw new NotFoundError('App external connection link not found');
        }
        await this.externalConnectionModel.unlinkFromApp(app.app_id, alias);
        this.analytics.track({
            event: 'external_connection.unlinked',
            userId: account.user.id,
            properties: {
                organizationId: link.connection.organizationUuid,
                projectId: projectUuid,
                externalConnectionUuid: link.connection.externalConnectionUuid,
                appUuid,
                alias,
            },
        });
    }

    private async authorizeProxyApp(
        account: Account,
        projectUuid: string,
        appUuid: string,
        chartContext: ExternalFetchRequest['chartContext'],
    ) {
        if (isJwtUser(account)) {
            const app = await this.appModel.findApp(appUuid, projectUuid);
            if (!app) {
                throw new ForbiddenError(
                    'Data app is not authorized by this embed',
                );
            }
            // Chart types inherit authorization from the chart or explorer rendering them.
            if (app.template === DATA_APP_VIZ_TEMPLATE) {
                await this.embedService.assertCanAccessDataAppVisualization(
                    account,
                    projectUuid,
                    appUuid,
                    chartContext,
                );
            } else {
                await assertCanViewEmbeddedApp(
                    {
                        createAuditedAbility: (embeddedAccount) =>
                            this.createAuditedAbility(embeddedAccount),
                        appModel: this.appModel,
                    },
                    account,
                    app,
                );
            }
            return app;
        }

        assertRegisteredAccount(account);
        const user = toSessionUser(account);
        const app = await this.appModel.getApp(appUuid, projectUuid);
        const assertCanViewDataApp = () =>
            assertCanViewApp(
                {
                    auditedAbility: this.createAuditedAbility(user),
                    resolveAccess: (userUuid, targetApp) =>
                        this.spacePermissionService.resolveAccess(userUuid, {
                            type: 'app',
                            appUuid: targetApp.app_id,
                            organizationUuid: targetApp.organization_uuid,
                            projectUuid: targetApp.project_uuid,
                            spaceUuid: targetApp.space_uuid,
                        }),
                    getProjectContext: (appProjectUuid) =>
                        this.getDataAppProjectContext(appProjectUuid),
                },
                user,
                app,
            );
        if (app.template !== DATA_APP_VIZ_TEMPLATE) {
            await assertCanViewDataApp();
            return app;
        }

        // Chart type authors keep data app permissions; chart access is additive.
        try {
            await assertCanViewDataApp();
        } catch (error) {
            if (
                !(error instanceof ForbiddenError) &&
                !(error instanceof NotFoundError)
            ) {
                throw error;
            }
            await this.appGenerateService.assertCanAccessDataAppVisualization(
                account,
                projectUuid,
                appUuid,
                chartContext,
            );
        }
        return app;
    }

    /** Connections a live api query can use: api sources the account may view. */
    async listApiSourceConnections(
        account: RegisteredAccount,
        projectUuid: string,
    ): Promise<ExternalConnection[]> {
        const organizationUuid =
            await this.externalConnectionModel.getProjectOrganizationUuid(
                projectUuid,
            );
        if (!organizationUuid) {
            throw new NotFoundError('Project not found');
        }
        const ability = this.createAuditedAbility(account);
        const connections = await this.externalConnectionModel.list(
            projectUuid,
            organizationUuid,
            { kind: 'live_source' },
        );
        return connections.filter(
            (connection) =>
                connection.apiSource &&
                ability.can('view', getExternalConnectionSubject(connection)),
        );
    }

    /** What each live source in the project has sent its integration. */
    async getApiSourceUsage(
        account: RegisteredAccount,
        projectUuid: string,
    ): Promise<ExternalConnectionApiUsage[]> {
        const organizationUuid =
            await this.externalConnectionModel.getProjectOrganizationUuid(
                projectUuid,
            );
        if (!organizationUuid) {
            throw new NotFoundError('Project not found');
        }
        this.assertCanManage(account, projectUuid, organizationUuid);
        return this.externalConnectionModel.getApiSourceUsage(projectUuid);
    }

    /**
     * A connector for a live api query. The stored secret never leaves this
     * service: requests go through the same guarded fetch as the app proxy.
     */
    async getApiConnector(
        account: RegisteredAccount,
        projectUuid: string,
        connectionUuid: string,
    ): Promise<MeteredApiConnector> {
        const connection = await this.getViewableConnection(
            account,
            projectUuid,
            connectionUuid,
        );
        return this.getMeteredApiConnector(account, projectUuid, connection);
    }

    /**
     * A connector for metric queries on a live data source's explores.
     * Explore access grants them, as it does for warehouse explores, so
     * callers MUST authorize the account for the explore first.
     */
    async getApiSourceConnector(
        account: RegisteredAccount,
        projectUuid: string,
        connectionUuid: string,
    ): Promise<MeteredApiConnector> {
        const connection = await this.loadConnection(
            projectUuid,
            connectionUuid,
        );
        return this.getMeteredApiConnector(account, projectUuid, connection);
    }

    /** Rebuilds the explores a live data source answers metric queries with. */
    async refreshApiSourceExplores(
        account: RegisteredAccount,
        projectUuid: string,
        connectionUuid: string,
    ): Promise<void> {
        const connection = await this.getOwnedConnection(
            account,
            projectUuid,
            connectionUuid,
        );
        await this.assertLiveSourcesEnabled(account);
        if (connection.kind !== 'live_source' || !connection.apiSource) {
            throw new ParameterError(
                `"${connection.name}" is not a live data source`,
            );
        }
        await this.syncApiSourceExplores(account, connection, 'throw');
    }

    /**
     * Scans the source, stores what the integration offers, and rebuilds its
     * explores. A failed scan either keeps the source's current explores
     * (`throw`) or builds from the last scan, or the base layer alone for a
     * new source (`useBaseLayer`).
     */
    private async syncApiSourceExplores(
        account: RegisteredAccount,
        connection: ExternalConnection,
        onScanError: 'throw' | 'useBaseLayer',
    ): Promise<void> {
        const { apiSource } = connection;
        if (connection.kind !== 'live_source' || !apiSource) {
            return;
        }
        const getScan = async (): Promise<ApiSourceScan | null> => {
            try {
                return await this.createApiConnector(account, connection, {
                    isPerQuery: false,
                }).scan();
            } catch (error) {
                if (onScanError === 'throw') {
                    throw error;
                }
                this.logger.warn(
                    `Building live data source ${connection.externalConnectionUuid} from its last scan; this scan failed: ${getErrorMessage(error)}`,
                );
                return null;
            }
        };
        const sourceName = await this.resolveLiveSourceName(
            connection,
            apiSource,
        );
        const scan = await getScan();
        if (scan) {
            const { externalConnectionUuid, projectUuid } = connection;
            const scannedFields = toScannedLiveSourceFields(
                apiSource.connector,
                scan,
            );
            await this.externalConnectionModel.saveLiveSourceScan(
                externalConnectionUuid,
                { scannedAt: new Date().toISOString(), fields: scannedFields },
            );
            await this.externalConnectionModel.initLiveSourceFieldEdits(
                externalConnectionUuid,
                getInitialLiveSourceFieldEdits({
                    scannedFields,
                    isExistingSource:
                        await this.projectModel.hasApiSourceExplores(
                            projectUuid,
                            externalConnectionUuid,
                        ),
                }),
            );
        }
        await this.rebuildApiSourceExplores(
            { ...connection, liveSourceName: sourceName },
            apiSource,
        );
    }

    /**
     * Rebuilds the source's explores from its stored scan and field edits,
     * without calling the integration. `keepFields` fails instead of removing
     * a field the source has today, leaving its explores as they are.
     */
    private async rebuildApiSourceExplores(
        connection: ExternalConnection,
        apiSource: ExternalConnectionApiSource,
        { keepFields }: { keepFields: boolean } = { keepFields: false },
    ): Promise<void> {
        const { externalConnectionUuid, projectUuid } = connection;
        await this.externalConnectionModel.withLiveSourceBuildLock(
            externalConnectionUuid,
            async () => {
                const [sourceName, state] = await Promise.all([
                    this.resolveLiveSourceName(connection, apiSource),
                    this.externalConnectionModel.getLiveSourceFieldState(
                        externalConnectionUuid,
                    ),
                ]);
                const scannedFields = state.lastScan?.fields ?? [];
                const edits =
                    state.fields ??
                    getInitialLiveSourceFieldEdits({
                        scannedFields,
                        isExistingSource: true,
                    });
                const explores = buildApiSourceExplores({
                    connectionUuid: externalConnectionUuid,
                    sourceName,
                    name: connection.name,
                    apiSource,
                    scannedFields,
                    edits,
                    aiHint: [
                        describeApiSourceTarget(
                            apiSource,
                            connection.origin,
                            state.targetLabel,
                        ),
                        ...(state.aiHint ? [state.aiHint] : []),
                    ],
                });
                if (keepFields) {
                    const lost = getLostApiSourceFieldIds({
                        storedFieldIds:
                            await this.projectModel.getApiSourceFieldIds(
                                projectUuid,
                                externalConnectionUuid,
                            ),
                        rebuilt: explores,
                        edits,
                    });
                    if (lost.length > 0) {
                        throw new UnexpectedServerError(
                            `Rebuilding would remove fields that charts can use: ${lost.join(', ')}`,
                        );
                    }
                }
                await this.projectModel.replaceApiSourceExplores(
                    projectUuid,
                    externalConnectionUuid,
                    explores,
                );
            },
        );
    }

    /**
     * Rebuilds every source whose explores no longer match the integration's
     * code. Safe to repeat or overlap: a rebuilt source matches and is
     * skipped, and each source is rebuilt on its own, so a failure only
     * leaves that source's explores as they were until the next run.
     */
    async rebuildOutdatedApiSourceExplores(): Promise<{
        rebuilt: number;
        failed: number;
    }> {
        const sources = await this.externalConnectionModel.listLiveSourceRefs();
        const stored = groupBy(
            await this.projectModel.listApiSourceExploreHashes([
                ...new Set(sources.map(({ projectUuid }) => projectUuid)),
            ]),
            'connectionUuid',
        );
        const counts = { rebuilt: 0, failed: 0 };
        /* eslint-disable no-await-in-loop -- one at a time keeps a deploy's rebuilds off the connection pool */
        for (const source of sources) {
            const { externalConnectionUuid } = source;
            try {
                const hashes = (stored[externalConnectionUuid] ?? []).map(
                    ({ definitionHash }) => definitionHash,
                );
                const isCurrent = isEqual(
                    [...hashes].sort(),
                    Object.values(
                        getApiSourceDefinitionHashes(source.connector),
                    ).sort(),
                );
                // A source with no explores was never built, so leave it to its own flow
                if (hashes.length > 0 && !isCurrent) {
                    const connection =
                        await this.externalConnectionModel.findByUuid(
                            externalConnectionUuid,
                        );
                    if (connection?.apiSource) {
                        await this.rebuildApiSourceExplores(
                            connection,
                            connection.apiSource,
                            { keepFields: true },
                        );
                        counts.rebuilt += 1;
                    }
                }
            } catch (error) {
                counts.failed += 1;
                this.logger.error(
                    `Could not rebuild live data source ${externalConnectionUuid}; its explores are unchanged: ${getErrorMessage(error)}`,
                );
            }
        }
        /* eslint-enable no-await-in-loop */
        return counts;
    }

    /**
     * Every field of a live source, in use or available. Admins only: everyone
     * else sees just the fields in use, through the source's explore.
     */
    async getLiveSourceFields(
        account: RegisteredAccount,
        projectUuid: string,
        connectionUuid: string,
    ): Promise<LiveSourceFields> {
        const connection = await this.getOwnedConnection(
            account,
            projectUuid,
            connectionUuid,
        );
        await this.assertLiveSourcesEnabled(account);
        return this.readLiveSourceFields(
            connection,
            ExternalConnectionService.getLiveSourceSettings(connection),
        );
    }

    /**
     * Changes fields of a live source and rebuilds its explores, with the
     * same admin check as refreshing fields.
     */
    async updateLiveSourceFields(
        account: RegisteredAccount,
        projectUuid: string,
        connectionUuid: string,
        changes: LiveSourceFieldChange[],
    ): Promise<LiveSourceFields> {
        const connection = await this.getOwnedConnection(
            account,
            projectUuid,
            connectionUuid,
        );
        await this.assertLiveSourcesEnabled(account);
        const apiSource =
            ExternalConnectionService.getLiveSourceSettings(connection);
        if (changes.length === 0) {
            return this.readLiveSourceFields(connection, apiSource);
        }
        const definition = getApiSourceWideDefinition(apiSource.connector);
        const state =
            await this.externalConnectionModel.getLiveSourceFieldState(
                connectionUuid,
            );
        const knownNames = new Set([
            ...definition.dimensions.map(({ name }) => name),
            ...definition.metrics.map(({ name }) => name),
            ...(state.lastScan?.fields ?? []).map(
                (field) => field.definition.name,
            ),
        ]);
        const editor: LiveSourceFieldEditor = {
            userUuid: account.user.id,
            userName:
                `${account.user.firstName ?? ''} ${account.user.lastName ?? ''}`.trim(),
            at: new Date().toISOString(),
        };
        await this.externalConnectionModel.updateLiveSourceFieldEdits(
            connectionUuid,
            (current) =>
                applyLiveSourceFieldChanges({
                    current,
                    changes,
                    knownNames,
                    requiredNames: new Set(getRequiredFieldNames(definition)),
                    editor,
                }),
        );
        await this.rebuildApiSourceExplores(connection, apiSource);
        this.analytics.track({
            event: 'live_source.fields_updated',
            userId: account.user.id,
            properties: {
                organizationId: connection.organizationUuid,
                projectId: projectUuid,
                externalConnectionUuid: connectionUuid,
                ...ExternalConnectionService.kindProperties(connection),
                changeCount: changes.length,
            },
        });
        return this.readLiveSourceFields(connection, apiSource);
    }

    private static getLiveSourceSettings(
        connection: ExternalConnection,
    ): ExternalConnectionApiSource {
        if (connection.kind !== 'live_source' || !connection.apiSource) {
            throw new ParameterError(
                `"${connection.name}" is not a live data source`,
            );
        }
        return connection.apiSource;
    }

    private async readLiveSourceFields(
        connection: ExternalConnection,
        apiSource: ExternalConnectionApiSource,
    ): Promise<LiveSourceFields> {
        const { externalConnectionUuid, projectUuid } = connection;
        const definition = getApiSourceWideDefinition(apiSource.connector);
        const [sourceName, state] = await Promise.all([
            this.resolveLiveSourceName(connection, apiSource),
            this.externalConnectionModel.getLiveSourceFieldState(
                externalConnectionUuid,
            ),
        ]);
        const usedByChartCount =
            await this.savedChartModel.getChartCountForExplores(
                projectUuid,
                getApiSourceExploreNames(apiSource.connector, sourceName),
            );
        const exploreName = getApiSourceExploreName(
            sourceName,
            definition.name,
        );
        const scannedFields = state.lastScan?.fields ?? [];
        const fieldNames = [
            ...definition.dimensions.map(({ name }) => name),
            ...definition.metrics.map(({ name }) => name),
            ...scannedFields.map((field) => field.definition.name),
        ];
        const usage = await this.savedChartModel.getChartCountPerField(
            projectUuid,
            fieldNames.map((name) => getItemId({ table: exploreName, name })),
        );
        const usageByFieldName = Object.fromEntries(
            usage.map(({ fieldId, count }) => [
                fieldId.slice(exploreName.length + 1),
                count,
            ]),
        );
        return {
            exploreName,
            usedByChartCount,
            scannedAt: state.lastScan?.scannedAt ?? null,
            fields: listLiveSourceFields({
                base: definition,
                scannedFields,
                edits:
                    state.fields ??
                    getInitialLiveSourceFieldEdits({
                        scannedFields,
                        isExistingSource: true,
                    }),
                usageByFieldName,
            }),
        };
    }

    /**
     * The explore prefix a source already holds. Sources built before prefixes
     * were stored keep their id-based one.
     */
    private async resolveLiveSourceName(
        connection: ExternalConnection,
        apiSource: ExternalConnectionApiSource,
    ): Promise<string> {
        if (connection.liveSourceName) {
            return connection.liveSourceName;
        }
        const { projectUuid, externalConnectionUuid } = connection;
        const legacyName = getLegacyLiveSourceName(
            apiSource.connector,
            externalConnectionUuid,
        );
        const claim = async (candidates: string[]) =>
            (await this.externalConnectionModel.claimLiveSourceName(
                projectUuid,
                externalConnectionUuid,
                candidates,
            )) ?? legacyName;
        if (
            await this.projectModel.hasApiSourceExplores(
                projectUuid,
                externalConnectionUuid,
            )
        ) {
            return claim([legacyName]);
        }
        const prefix = getDefaultExplorePrefix(
            apiSource.connector,
            connection.name,
        );
        const unavailable = await this.findUnavailableExplorePrefixes(
            projectUuid,
            apiSource.connector,
            [prefix],
            externalConnectionUuid,
        );
        return claim(
            unavailable.has(prefix) ? [legacyName] : [prefix, legacyName],
        );
    }

    /**
     * The prefixes another source holds, or whose explore names, built or
     * kept free for planned models, belong to something else.
     */
    private async findUnavailableExplorePrefixes(
        projectUuid: string,
        connector: ApiConnectorType,
        prefixes: string[],
        connectionUuid: string | null,
    ): Promise<Set<string>> {
        const getNames = (prefix: string) => [
            ...getApiSourceExploreNames(connector, prefix),
            ...getApiSourceReservedExploreNames(connector, prefix),
        ];
        const [held, taken] = await Promise.all([
            this.externalConnectionModel.listHeldLiveSourceNames(
                projectUuid,
                connectionUuid,
            ),
            this.projectModel.findExploreNamesTakenByOthers(
                projectUuid,
                connectionUuid,
                prefixes.flatMap(getNames),
            ),
        ]);
        const takenNames = new Set(taken);
        return new Set(
            prefixes.filter(
                (prefix) =>
                    held.has(prefix) ||
                    getNames(prefix).some((name) => takenNames.has(name)),
            ),
        );
    }

    private async getExplorePrefixCheck(
        projectUuid: string,
        connector: ApiConnectorType,
        prefix: string,
    ): Promise<ExplorePrefixCheck> {
        const error = getExplorePrefixError(prefix);
        if (error) {
            return {
                prefix,
                exploreNames: [],
                error,
                suggestion: null,
                suggestionExploreNames: [],
            };
        }
        const candidates = [
            prefix,
            ...Array.from(
                { length: MAX_EXPLORE_PREFIX_SUGGESTIONS - 1 },
                (_, index) => {
                    const suffix = `_${index + 2}`;
                    return `${prefix.slice(0, EXPLORE_PREFIX_MAX_LENGTH - suffix.length)}${suffix}`;
                },
            ),
        ];
        const unavailable = await this.findUnavailableExplorePrefixes(
            projectUuid,
            connector,
            candidates,
            null,
        );
        const exploreNames = getApiSourceExploreNames(connector, prefix);
        const suggestion =
            candidates.find((candidate) => !unavailable.has(candidate)) ?? null;
        return unavailable.has(prefix)
            ? {
                  prefix,
                  exploreNames,
                  error: `"${prefix}" is already used by another source or explore in this project`,
                  suggestion,
                  suggestionExploreNames: suggestion
                      ? getApiSourceExploreNames(connector, suggestion)
                      : [],
              }
            : {
                  prefix,
                  exploreNames,
                  error: null,
                  suggestion: null,
                  suggestionExploreNames: [],
              };
    }

    /** Whether a new source of this integration can use an explore prefix. */
    async checkExplorePrefix(
        account: RegisteredAccount,
        projectUuid: string,
        connector: ApiConnectorType,
        prefix: string,
    ): Promise<ExplorePrefixCheck> {
        await this.assertCanManageLiveSources(account, projectUuid);
        await this.assertLiveSourcesEnabled(account);
        return this.getExplorePrefixCheck(projectUuid, connector, prefix);
    }

    /** The prefix a new live source will get; refuses one it can't use. */
    private async resolveNewExplorePrefix(
        projectUuid: string,
        config: CreateExternalConnection,
    ): Promise<string | null> {
        if (!config.apiSource) {
            return null;
        }
        const { connector } = config.apiSource;
        const prefix =
            config.explorePrefix ??
            getDefaultExplorePrefix(connector, config.name);
        const { error, suggestion } = await this.getExplorePrefixCheck(
            projectUuid,
            connector,
            prefix,
        );
        if (!error) {
            return prefix;
        }
        // Without a form to show a clash on, like onboarding, take the free one
        if (config.explorePrefix === undefined && suggestion) {
            return suggestion;
        }
        if (getExplorePrefixError(prefix)) {
            throw new ParameterError(`Invalid Source ID: ${error}`);
        }
        throw new AlreadyExistsError(
            suggestion ? `${error}. Try "${suggestion}".` : `${error}.`,
        );
    }

    /** A create that lost the prefix to another one started at the same time is undone. */
    private async holdExplorePrefix(
        connection: ExternalConnection,
        explorePrefix: string | null,
    ): Promise<ExternalConnection> {
        if (!explorePrefix) {
            return connection;
        }
        const { projectUuid, externalConnectionUuid } = connection;
        const liveSourceName =
            await this.externalConnectionModel.claimLiveSourceName(
                projectUuid,
                externalConnectionUuid,
                [explorePrefix],
            );
        if (liveSourceName !== explorePrefix) {
            await this.externalConnectionModel.softDelete(
                externalConnectionUuid,
            );
            throw new AlreadyExistsError(
                `"${explorePrefix}" was just taken by another source`,
            );
        }
        return { ...connection, liveSourceName };
    }

    private static isSameLiveSourceTarget(
        source: Pick<DeletedLiveSource, 'origin' | 'apiSource'>,
        connection: ExternalConnection,
        apiSource: ExternalConnectionApiSource,
    ): boolean {
        return (
            source.origin === connection.origin &&
            isEqual(source.apiSource, apiSource)
        );
    }

    /** One deleted source per prefix that no active source has taken back. */
    private async listDeletedSourcesToReattach(
        connection: ExternalConnection,
        connector: ApiConnectorType,
    ): Promise<(DeletedLiveSource & { explorePrefix: string })[]> {
        const { projectUuid, organizationUuid } = connection;
        const [deleted, active] = await Promise.all([
            this.externalConnectionModel.listDeletedLiveSources(projectUuid),
            this.externalConnectionModel.list(projectUuid, organizationUuid, {
                kind: 'live_source',
            }),
        ]);
        const activeNames = new Set(
            active.flatMap(({ liveSourceName }) =>
                liveSourceName ? [liveSourceName] : [],
            ),
        );
        const withPrefixes = deleted
            .filter((source) => source.apiSource.connector === connector)
            .map((source) => ({
                ...source,
                explorePrefix:
                    source.sourceName ??
                    getLegacyLiveSourceName(
                        connector,
                        source.externalConnectionUuid,
                    ),
            }))
            .filter(({ explorePrefix }) => !activeNames.has(explorePrefix));
        return uniqBy(withPrefixes, 'explorePrefix');
    }

    /** Deleted sources a new source can reattach to, matching targets first. */
    async listReattachableLiveSources(
        account: RegisteredAccount,
        projectUuid: string,
        connectionUuid: string,
    ): Promise<ReattachableLiveSource[]> {
        const connection = await this.getOwnedConnection(
            account,
            projectUuid,
            connectionUuid,
        );
        await this.assertLiveSourcesEnabled(account);
        const apiSource =
            ExternalConnectionService.getLiveSourceSettings(connection);
        const deleted = await this.listDeletedSourcesToReattach(
            connection,
            apiSource.connector,
        );
        const sources = await Promise.all(
            deleted.map(async (source): Promise<ReattachableLiveSource[]> => {
                const exploreNames = getApiSourceExploreNames(
                    apiSource.connector,
                    source.explorePrefix,
                );
                const usedByChartCount =
                    await this.savedChartModel.getChartCountForExplores(
                        projectUuid,
                        exploreNames,
                    );
                // Never named or charted: there is nothing to reattach to
                if (source.sourceName === null && usedByChartCount === 0) {
                    return [];
                }
                return [
                    {
                        externalConnectionUuid: source.externalConnectionUuid,
                        name: source.name,
                        explorePrefix: source.explorePrefix,
                        exploreNames,
                        apiSource: source.apiSource,
                        deletedAt: source.deletedAt,
                        usedByChartCount,
                        isSameTarget:
                            ExternalConnectionService.isSameLiveSourceTarget(
                                source,
                                connection,
                                apiSource,
                            ),
                    },
                ];
            }),
        );
        return sortBy(sources.flat(), ({ isSameTarget }) => !isSameTarget);
    }

    /**
     * Gives a new source a deleted source's explore prefix and field edits,
     * so the deleted source's charts work again.
     */
    async reattachLiveSource(
        account: RegisteredAccount,
        projectUuid: string,
        connectionUuid: string,
        deletedConnectionUuid: string,
    ): Promise<ExternalConnection> {
        const connection = await this.getOwnedConnection(
            account,
            projectUuid,
            connectionUuid,
        );
        await this.assertLiveSourcesEnabled(account);
        const apiSource =
            ExternalConnectionService.getLiveSourceSettings(connection);
        const { connector } = apiSource;
        const deleted = (
            await this.listDeletedSourcesToReattach(connection, connector)
        ).find(
            (source) => source.externalConnectionUuid === deletedConnectionUuid,
        );
        if (!deleted) {
            throw new NotFoundError(
                'That deleted live data source cannot be reattached',
            );
        }
        const currentPrefix = await this.resolveLiveSourceName(
            connection,
            apiSource,
        );
        const chartCount = await this.savedChartModel.getChartCountForExplores(
            projectUuid,
            getApiSourceExploreNames(connector, currentPrefix),
        );
        if (chartCount > 0) {
            throw new ParameterError(
                `"${connection.name}" can't be reattached because saved charts already use it`,
            );
        }
        const { explorePrefix } = deleted;
        const [clash] = await this.projectModel.findExploreNamesTakenByOthers(
            projectUuid,
            connectionUuid,
            getApiSourceExploreNames(connector, explorePrefix),
        );
        if (clash) {
            throw new AlreadyExistsError(`Explore "${clash}" already exists`);
        }
        const { lastScan } =
            await this.externalConnectionModel.getLiveSourceFieldState(
                connectionUuid,
            );
        const isReattached =
            await this.externalConnectionModel.reattachLiveSourceName(
                projectUuid,
                connectionUuid,
                explorePrefix,
                // Deleted before fields could be curated: every field stays in use
                deleted.fieldEdits ??
                    (lastScan
                        ? getInitialLiveSourceFieldEdits({
                              scannedFields: lastScan.fields,
                              isExistingSource: true,
                          })
                        : null),
            );
        if (!isReattached) {
            throw new AlreadyExistsError(
                `"${explorePrefix}" is already used by another source`,
            );
        }
        await this.externalConnectionModel.restoreLiveSourceDetails(
            connectionUuid,
            deleted,
        );
        const reattached = {
            ...connection,
            liveSourceName: explorePrefix,
        };
        await this.syncApiSourceExploresAfterChange(
            account,
            reattached,
            'useBaseLayer',
        );
        this.analytics.track({
            event: 'live_source.reattached',
            userId: account.user.id,
            properties: {
                organizationId: connection.organizationUuid,
                projectId: projectUuid,
                externalConnectionUuid: connectionUuid,
                ...ExternalConnectionService.kindProperties(connection),
                isSameTarget: ExternalConnectionService.isSameLiveSourceTarget(
                    deleted,
                    connection,
                    apiSource,
                ),
            },
        });
        return reattached;
    }

    /** Explore sync after a source changes; a failure never undoes the change. */
    private async syncApiSourceExploresAfterChange(
        account: RegisteredAccount,
        connection: ExternalConnection,
        onScanError: 'throw' | 'useBaseLayer',
    ): Promise<void> {
        try {
            await this.syncApiSourceExplores(account, connection, onScanError);
        } catch (error) {
            this.logger.error(
                `Failed to save the explores of live data source ${connection.externalConnectionUuid}: ${getErrorMessage(error)}`,
            );
        }
    }

    private getMeteredApiConnector(
        account: RegisteredAccount,
        projectUuid: string,
        connection: ExternalConnection,
    ): MeteredApiConnector {
        const { connector, usage } = this.createApiConnector(
            account,
            connection,
            { isPerQuery: true },
        );
        return {
            describe: () => connector.describe(),
            execute: (args) => connector.execute(args),
            usage: () => ({ ...usage }),
            logCall: async (call) => {
                try {
                    await this.externalConnectionModel.insertApiSourceCall({
                        external_connection_uuid:
                            connection.externalConnectionUuid,
                        project_uuid: projectUuid,
                        user_uuid: account.user.id,
                        context: call.context,
                        query_uuid: call.queryUuid,
                        query: call.query,
                        row_limit: call.rowLimit,
                        outcome: call.outcome,
                        error_message: call.errorMessage,
                        provider_status: usage.providerStatus,
                        api_calls: usage.apiCalls,
                        duration_ms: call.durationMs,
                        row_count: call.rowCount,
                        column_count: call.columnCount,
                        truncated: call.truncated,
                        response_bytes: usage.responseBytes,
                    });
                } catch (error) {
                    this.logger.error(
                        `Failed to log api query ${call.queryUuid} for connection ${connection.externalConnectionUuid}: ${getErrorMessage(error)}`,
                    );
                }
            },
        };
    }

    /** Queues a schema scan for a PostHog source; a failure to queue never fails the save. */
    private async scheduleApiSourceSchemaScan(
        account: RegisteredAccount,
        connection: ExternalConnection,
    ): Promise<void> {
        if (
            connection.apiSource?.connector !== ApiConnectorType.POSTHOG ||
            !(await this.isNewOnboardingEnabled(account))
        ) {
            return;
        }
        try {
            await this.externalConnectionModel.setApiSourceSchema(
                connection.externalConnectionUuid,
                { status: 'pending', requestedAt: new Date() },
            );
            await this.schedulerClient.scanApiSourceSchema({
                organizationUuid: connection.organizationUuid,
                projectUuid: connection.projectUuid,
                userUuid: account.user.id,
                externalConnectionUuid: connection.externalConnectionUuid,
            });
        } catch (error) {
            this.logger.error(
                `Failed to queue a schema scan for connection ${connection.externalConnectionUuid}: ${getErrorMessage(error)}`,
            );
            await this.externalConnectionModel
                .setApiSourceSchema(connection.externalConnectionUuid, {
                    status: 'failed',
                    scannedAt: new Date(),
                    error: 'The schema scan could not be queued',
                })
                .catch(() => undefined);
        }
    }

    /** Runs a queued schema scan and stores what it found, or why it failed. */
    async scanApiSourceSchema(
        account: RegisteredAccount,
        projectUuid: string,
        connectionUuid: string,
    ): Promise<ApiSourceSchemaScan> {
        let scan: ApiSourceSchemaScan;
        try {
            scan = await scanPostHogSchema(() =>
                this.getApiConnector(account, projectUuid, connectionUuid),
            );
        } catch (error) {
            scan = toFailedScan(error);
        }
        await this.externalConnectionModel.setApiSourceSchema(
            connectionUuid,
            scan,
        );
        return scan;
    }

    async getApiSourceSchema(
        account: RegisteredAccount,
        projectUuid: string,
        connectionUuid: string,
    ): Promise<ApiSourceSchemaScan | null> {
        await this.assertLiveSourcesEnabled(account);
        await this.getViewableConnection(account, projectUuid, connectionUuid);
        const scans = await this.externalConnectionModel.getApiSourceSchemas([
            connectionUuid,
        ]);
        return scans.get(connectionUuid) ?? null;
    }

    /** Live sources the account may query, each with its last schema scan. */
    async listApiSourceConnectionsWithSchema(
        account: RegisteredAccount,
        projectUuid: string,
    ): Promise<
        { connection: ExternalConnection; scan: ApiSourceSchemaScan | null }[]
    > {
        const connections = await this.listApiSourceConnections(
            account,
            projectUuid,
        );
        const scans = await this.externalConnectionModel.getApiSourceSchemas(
            connections.map(
                ({ externalConnectionUuid }) => externalConnectionUuid,
            ),
        );
        return connections.map((connection) => ({
            connection,
            scan: scans.get(connection.externalConnectionUuid) ?? null,
        }));
    }

    async listApiSourceSchemaTables(
        account: RegisteredAccount,
        projectUuid: string,
    ): Promise<QuerySourceSchemaTable[]> {
        if (!(await this.isNewOnboardingEnabled(account))) return [];
        const sources = await this.listApiSourceConnectionsWithSchema(
            account,
            projectUuid,
        );
        return sources.flatMap(({ connection, scan }) =>
            scan?.status === 'ready' &&
            connection.apiSource?.connector === ApiConnectorType.POSTHOG
                ? [
                      toPostHogSchemaTable(
                          {
                              connectionUuid: connection.externalConnectionUuid,
                              name: connection.name,
                          },
                          scan,
                      ),
                  ]
                : [],
        );
    }

    /**
     * The integration's connector over the guarded fetch. Per-query
     * connectors refuse to make more calls than one query may.
     */
    private createApiConnector(
        account: RegisteredAccount,
        storedConnection: ExternalConnection,
        { isPerQuery }: { isPerQuery: boolean },
    ): {
        connector: ApiConnector;
        usage: ApiConnectorUsage;
        scan: () => Promise<ApiSourceScan>;
    } {
        const { apiSource } = storedConnection;
        if (storedConnection.kind !== 'live_source' || !apiSource) {
            throw new ParameterError(
                `"${storedConnection.name}" is not a live data source`,
            );
        }
        // Live source access rules come from the integration, so sources
        // saved before a rule changed get the current rules.
        const connection = withApiSourceAccessRules(storedConnection);
        let callsThisQuery = 0;
        const usage: ApiConnectorUsage = {
            apiCalls: 0,
            responseBytes: 0,
            providerStatus: null,
        };
        const sendOnce: ApiConnectorTransport = async (request) => {
            const secret =
                await this.externalConnectionModel.getDecryptedSecret(
                    connection.externalConnectionUuid,
                );
            usage.apiCalls += 1;
            try {
                const { response, responseBytes } =
                    await this.executeExternalFetch(
                        connection,
                        secret,
                        {
                            method: request.method,
                            path: request.path,
                            query: request.query,
                            rawQuery: request.rawQuery,
                            body: request.body,
                        },
                        { account, appUuid: null },
                    );
                usage.responseBytes += responseBytes;
                usage.providerStatus = response.status;
                return {
                    status: response.status,
                    headers: response.headers,
                    body: response.body,
                };
            } catch (error) {
                if (error instanceof SecureFetchError) {
                    if (error.reason === 'timeout') {
                        throw new TimeoutError(
                            `Live data source "${connection.name}" did not respond within ${
                                connection.timeoutMs / 1000
                            } seconds`,
                        );
                    }
                    throw new ParameterError(
                        `Request to live data source "${connection.name}" was blocked (${error.reason})`,
                    );
                }
                throw error;
            }
        };
        const send: ApiConnectorTransport = async (request) => {
            // eslint-disable-next-line no-use-before-define -- connectors only send once created
            const { label, limits } = connector.describe();
            callsThisQuery += 1;
            if (isPerQuery && callsThisQuery > limits.callsPerQuery) {
                throw new ParameterError(
                    `This query needs more than ${limits.callsPerQuery} ${label} API calls. Narrow it with filters or a shorter time range.`,
                );
            }
            return this.apiSourceCallLimiter.run(connection, limits, () =>
                sendOnce(request),
            );
        };
        const { connector, scan = async () => ({}) } = getApiSourceIntegration(
            apiSource.connector,
        ).createConnector(apiSource, send);
        return { connector, usage, scan };
    }

    private static isPostHogRegion(region: string): region is PostHogRegion {
        return Object.hasOwn(POSTHOG_REGION_ORIGINS, region);
    }

    private getGoogleClient(): {
        clientId: string;
        clientSecret: string;
    } | null {
        const { oauth2ClientId, oauth2ClientSecret } =
            this.lightdashConfig.auth.google;
        return oauth2ClientId && oauth2ClientSecret
            ? { clientId: oauth2ClientId, clientSecret: oauth2ClientSecret }
            : null;
    }

    /** The secret of whichever configured sign-in client issued a connection's tokens. */
    private getOAuthClientSecret(clientId: string): string | null {
        const { oauthClientId, oauthClientSecret } =
            this.lightdashConfig.liveSources.posthog;
        if (clientId === oauthClientId) return oauthClientSecret ?? null;
        const linkedInAds = this.lightdashConfig.liveSources.linkedinAds;
        if (clientId === linkedInAds.oauthClientId) {
            return linkedInAds.oauthClientSecret ?? null;
        }
        const google = this.getGoogleClient();
        return google && clientId === google.clientId
            ? google.clientSecret
            : null;
    }

    getPostHogClientMetadata(): Record<string, unknown> | null {
        if (!this.lightdashConfig.liveSources.posthog.oauthClientId)
            return null;
        return getPostHogClientMetadata(this.lightdashConfig.siteUrl);
    }

    /** Where the sign-in callback lands, with its outcome for that page to show. */
    getLiveDataSourcesUrl(
        projectUuid: string,
        result:
            | { connectionUuid: string }
            | { error: string }
            | { pickGoogleSource: true },
        returnTo: LiveSourceReturnTo = 'settings',
    ): string {
        const url = new URL(
            returnTo === 'onboarding'
                ? `/onboarding/tools/${projectUuid}`
                : `/generalSettings/projectManagement/${projectUuid}/liveDataSources`,
            this.lightdashConfig.siteUrl,
        );
        if ('error' in result) {
            url.searchParams.set('signInError', result.error);
        } else if ('pickGoogleSource' in result) {
            url.searchParams.set('pickGoogleSource', 'true');
        } else {
            url.searchParams.set('connected', result.connectionUuid);
        }
        return url.href;
    }

    /** Refuses a PostHog reconnect that would point the source at another region or project. */
    private static assertSamePostHogSource(
        existing: ExternalConnection,
        granted: { origin: string; projectId: string | null },
    ): void {
        if (existing.apiSource?.connector !== ApiConnectorType.POSTHOG) {
            throw new ParameterError(
                `Live data source "${existing.name}" does not use PostHog`,
            );
        }
        if (existing.origin !== granted.origin) {
            const region = Object.entries(POSTHOG_REGION_ORIGINS).find(
                ([, origin]) => origin === existing.origin,
            )?.[0];
            throw new ParameterError(
                `Pick the ${region?.toUpperCase() ?? existing.origin} PostHog region to reconnect "${existing.name}"`,
            );
        }
        const { projectId } = existing.apiSource;
        if (granted.projectId !== null && granted.projectId !== projectId) {
            throw new ParameterError(
                `Pick project ${projectId} in PostHog to reconnect "${existing.name}"`,
            );
        }
    }

    /** Starts the PostHog sign-in that creates a source, or reconnects one. */
    async startPostHogOAuth(
        account: RegisteredAccount,
        projectUuid: string,
        request: {
            region: string;
            name: string;
            explorePrefix?: string;
            connectionUuid: string | null;
        },
    ): Promise<{
        authorizeUrl: string;
        state: string;
        session: PostHogOAuthSession;
    }> {
        const { oauthClientId } = this.lightdashConfig.liveSources.posthog;
        if (!oauthClientId) {
            throw new MissingConfigError(
                'Signing in to PostHog is not configured on this server',
            );
        }
        const organizationUuid =
            await this.externalConnectionModel.getProjectOrganizationUuid(
                projectUuid,
            );
        if (!organizationUuid) {
            throw new NotFoundError('Project not found');
        }
        this.assertCanManage(account, projectUuid, organizationUuid);
        await this.assertLiveSourcesEnabled(account);
        const { region, connectionUuid, explorePrefix } = request;
        if (!ExternalConnectionService.isPostHogRegion(region)) {
            throw new ParameterError('Pick the US or EU PostHog region');
        }
        const name = request.name.trim();
        if (!name) {
            throw new ParameterError('Name is required');
        }
        if (connectionUuid) {
            const existing = await this.getOwnedConnection(
                account,
                projectUuid,
                connectionUuid,
            );
            ExternalConnectionService.assertSamePostHogSource(existing, {
                origin: POSTHOG_REGION_ORIGINS[region],
                projectId: null,
            });
        }

        const state = randomBytes(24).toString('base64url');
        const codeVerifier = randomBytes(32).toString('base64url');
        const redirectUri = getPostHogOAuthRedirectUri(
            this.lightdashConfig.siteUrl,
        );
        return {
            authorizeUrl: buildPostHogAuthorizeUrl({
                origin: POSTHOG_REGION_ORIGINS[region],
                clientId: oauthClientId,
                redirectUri,
                state,
                codeChallenge: createHash('sha256')
                    .update(codeVerifier)
                    .digest('base64url'),
            }),
            state,
            session: {
                projectUuid,
                region,
                name,
                explorePrefix,
                connectionUuid,
                clientId: oauthClientId,
                redirectUri,
                codeVerifier,
            },
        };
    }

    /** Exchanges the sign-in code and stores the tokens on a new or reconnected source. */
    async completePostHogOAuth(
        account: RegisteredAccount,
        session: PostHogOAuthSession,
        code: string,
    ): Promise<ExternalConnection> {
        const { projectUuid } = session;
        const organizationUuid =
            await this.externalConnectionModel.getProjectOrganizationUuid(
                projectUuid,
            );
        if (!organizationUuid) {
            throw new NotFoundError('Project not found');
        }
        this.assertCanManage(account, projectUuid, organizationUuid);
        await this.assertLiveSourcesEnabled(account);

        const origin = POSTHOG_REGION_ORIGINS[session.region];
        const client: OAuthAuthorizationCodeClientConfig = {
            tokenUrl: getPostHogOAuthEndpoints(origin).tokenUrl,
            clientId: session.clientId,
            clientSecret: this.getOAuthClientSecret(session.clientId),
        };
        let grant: Awaited<
            ReturnType<OAuthAuthorizationCodeTokenClient['exchangeCode']>
        >;
        try {
            grant = await this.oauthAuthorizationCodeTokenClient.exchangeCode(
                client,
                {
                    code,
                    redirectUri: session.redirectUri,
                    codeVerifier: session.codeVerifier,
                },
            );
        } catch (error) {
            this.logger.warn(
                `PostHog sign-in failed: ${getErrorMessage(error)}`,
            );
            throw new WarehouseConnectionError(
                'PostHog did not accept the sign-in. Try connecting again.',
            );
        }
        const projectId = getPostHogGrantedProjectId(grant.response);
        if (!projectId) {
            throw new ParameterError(
                'Pick a single PostHog project when signing in',
            );
        }
        // Reconnect only refreshes the sign-in; another project is another source
        if (session.connectionUuid) {
            const existing = await this.getOwnedConnection(
                account,
                projectUuid,
                session.connectionUuid,
            );
            ExternalConnectionService.assertSamePostHogSource(existing, {
                origin,
                projectId,
            });
        }

        const config = withApiSourceAccessRules<CreateExternalConnection>({
            name: session.name,
            ...(session.explorePrefix
                ? { explorePrefix: session.explorePrefix }
                : {}),
            type: 'oauth_authorization_code',
            origin,
            secret: serializeStoredOAuthTokens(grant.tokens),
            apiSource: { connector: ApiConnectorType.POSTHOG, projectId },
            oauthTokenUrl: client.tokenUrl,
            oauthClientId: client.clientId,
            oauthClientAuthMethod: null,
            oauthScopes: null,
            apiKeyName: null,
            apiKeyLocation: null,
            allowedPathPrefixes: [],
            allowedMethods: [],
            allowedContentTypes: [],
            allowBrowserImages: false,
            allowDataAppBuilderLinking: false,
            forwardUserIdentity: false,
            instructions: null,
        });
        return this.saveSignedInConnection(account, {
            projectUuid,
            organizationUuid,
            connectionUuid: session.connectionUuid,
            config,
        });
    }

    /** Creates a signed-in source, or replaces the sign-in of the one being reconnected. */
    private async saveSignedInConnection(
        account: RegisteredAccount,
        {
            projectUuid,
            organizationUuid,
            connectionUuid,
            config,
            targetLabel,
        }: {
            projectUuid: string;
            organizationUuid: string;
            connectionUuid: string | null;
            config: CreateExternalConnection;
            targetLabel?: string;
        },
    ): Promise<ExternalConnection> {
        validateExternalConnectionConfig(config, true);
        validateApiSourceConnection(config);

        if (connectionUuid) {
            const existing = await this.getOwnedConnection(
                account,
                projectUuid,
                connectionUuid,
            );
            const updated = await this.externalConnectionModel.update(
                existing.externalConnectionUuid,
                account.user.id,
                config,
            );
            this.analytics.track({
                event: 'external_connection.updated',
                userId: account.user.id,
                properties: {
                    organizationId: organizationUuid,
                    projectId: projectUuid,
                    externalConnectionUuid: existing.externalConnectionUuid,
                    ...ExternalConnectionService.kindProperties(updated),
                },
            });
            if (targetLabel) {
                await this.externalConnectionModel.saveLiveSourceTargetLabel(
                    existing.externalConnectionUuid,
                    targetLabel,
                );
            }
            await this.scheduleApiSourceSchemaScan(account, updated);
            await this.syncApiSourceExploresAfterChange(
                account,
                updated,
                'throw',
            );
            return updated;
        }

        const explorePrefix = await this.resolveNewExplorePrefix(
            projectUuid,
            config,
        );
        const connection = await this.holdExplorePrefix(
            await this.externalConnectionModel.create(
                projectUuid,
                organizationUuid,
                account.user.id,
                config,
            ),
            explorePrefix,
        );
        this.analytics.track({
            event: 'external_connection.created',
            userId: account.user.id,
            properties: {
                organizationId: organizationUuid,
                projectId: projectUuid,
                externalConnectionUuid: connection.externalConnectionUuid,
                ...ExternalConnectionService.kindProperties(connection),
                authType: connection.type,
            },
        });
        if (targetLabel) {
            await this.externalConnectionModel.saveLiveSourceTargetLabel(
                connection.externalConnectionUuid,
                targetLabel,
            );
        }
        await this.scheduleApiSourceSchemaScan(account, connection);
        await this.syncApiSourceExploresAfterChange(
            account,
            connection,
            'useBaseLayer',
        );
        return connection;
    }

    private async assertCanManageLiveSources(
        account: RegisteredAccount,
        projectUuid: string,
    ): Promise<string> {
        const organizationUuid =
            await this.externalConnectionModel.getProjectOrganizationUuid(
                projectUuid,
            );
        if (!organizationUuid) {
            throw new NotFoundError('Project not found');
        }
        this.assertCanManage(account, projectUuid, organizationUuid);
        await this.assertLiveSourcesEnabled(account);
        return organizationUuid;
    }

    private readonly requestGoogleApi = async (
        url: string,
        accessToken: string,
        request: { method: 'GET' } | { method: 'POST'; body: string },
        headers: Record<string, string>,
    ) => {
        const response = await secureFetch(url, {
            ...request,
            headers: { ...headers, Authorization: `Bearer ${accessToken}` },
            timeoutMs: GOOGLE_API_TIMEOUT_MS,
            maxResponseBytes: GOOGLE_API_RESPONSE_MAX_BYTES,
            allowedContentTypes: ['application/json'],
            allowedPrivateHostCidrs: this.allowedPrivateHostCidrs,
        });
        let body: unknown = null;
        try {
            body = JSON.parse(response.bodyText);
        } catch {
            body = null;
        }
        return { status: response.status, body };
    };

    private readonly googleApi: GoogleApi = {
        get: (url, accessToken) =>
            this.requestGoogleApi(url, accessToken, { method: 'GET' }, {}),
        post: (url, accessToken, body, headers) =>
            this.requestGoogleApi(
                url,
                accessToken,
                { method: 'POST', body: JSON.stringify(body) },
                { ...headers, 'Content-Type': 'application/json' },
            ),
    };

    private static assertSameLinkedInAdsSource(
        existing: ExternalConnection,
        adAccountId: string,
    ) {
        if (
            existing.apiSource?.connector !== ApiConnectorType.LINKEDIN_ADS ||
            existing.apiSource.adAccountId !== adAccountId
        ) {
            throw new ParameterError(
                `Live data source "${existing.name}" reads a different LinkedIn ad account`,
            );
        }
    }

    /** Starts the LinkedIn sign-in that creates a source, or reconnects one. */
    async startLinkedInAdsOAuth(
        account: RegisteredAccount,
        projectUuid: string,
        request: {
            name: string;
            adAccountId: string;
            connectionUuid: string | null;
        },
    ): Promise<{
        authorizeUrl: string;
        state: string;
        session: LinkedInAdsOAuthSession;
    }> {
        const { oauthClientId, oauthClientSecret } =
            this.lightdashConfig.liveSources.linkedinAds;
        if (!oauthClientId || !oauthClientSecret) {
            throw new MissingConfigError(
                'Signing in to LinkedIn is not configured on this server',
            );
        }
        const organizationUuid =
            await this.externalConnectionModel.getProjectOrganizationUuid(
                projectUuid,
            );
        if (!organizationUuid) {
            throw new NotFoundError('Project not found');
        }
        this.assertCanManage(account, projectUuid, organizationUuid);
        await this.assertLiveSourcesEnabled(account);
        const name = request.name.trim();
        if (!name) {
            throw new ParameterError('Name is required');
        }
        const adAccountId = request.adAccountId.trim();
        if (!LINKEDIN_AD_ACCOUNT_ID.test(adAccountId)) {
            throw new ParameterError(
                'The LinkedIn ad account ID must be a number',
            );
        }
        const { connectionUuid } = request;
        if (connectionUuid) {
            ExternalConnectionService.assertSameLinkedInAdsSource(
                await this.getOwnedConnection(
                    account,
                    projectUuid,
                    connectionUuid,
                ),
                adAccountId,
            );
        }

        const state = randomBytes(24).toString('base64url');
        const redirectUri = getLinkedInAdsOAuthRedirectUri(
            this.lightdashConfig.siteUrl,
        );
        return {
            authorizeUrl: buildLinkedInAdsAuthorizeUrl({
                clientId: oauthClientId,
                redirectUri,
                state,
            }),
            state,
            session: {
                projectUuid,
                name,
                adAccountId,
                connectionUuid,
                clientId: oauthClientId,
                redirectUri,
            },
        };
    }

    /** Refuses a sign-in that can't read the ad account the admin named. */
    private async assertCanReadLinkedInAdAccount(
        adAccountId: string,
        accessToken: string,
    ) {
        const response = await secureFetch(
            `${LINKEDIN_ADS_ORIGIN}${getLinkedInAdsAccountPath(adAccountId)}`,
            {
                method: 'GET',
                headers: {
                    ...LINKEDIN_ADS_REQUEST_HEADERS,
                    Authorization: `Bearer ${accessToken}`,
                },
                timeoutMs: LINKEDIN_ACCOUNT_CHECK_TIMEOUT_MS,
                maxResponseBytes: LINKEDIN_ACCOUNT_CHECK_MAX_BYTES,
                allowedContentTypes: ['application/json'],
                allowedPrivateHostCidrs: this.allowedPrivateHostCidrs,
            },
        );
        if (response.status < 200 || response.status >= 300) {
            this.logger.warn(
                `LinkedIn ad account check returned ${response.status}`,
            );
            throw new WarehouseConnectionError(
                `This LinkedIn member can't read ad account ${adAccountId}. Check the ID in Campaign Manager and that the member has a role on the account.`,
            );
        }
    }

    /** Exchanges the sign-in code and stores the tokens on a new or reconnected source. */
    async completeLinkedInAdsOAuth(
        account: RegisteredAccount,
        session: LinkedInAdsOAuthSession,
        code: string,
    ): Promise<ExternalConnection> {
        const { projectUuid, adAccountId } = session;
        const organizationUuid =
            await this.externalConnectionModel.getProjectOrganizationUuid(
                projectUuid,
            );
        if (!organizationUuid) {
            throw new NotFoundError('Project not found');
        }
        this.assertCanManage(account, projectUuid, organizationUuid);
        await this.assertLiveSourcesEnabled(account);

        const client: OAuthAuthorizationCodeClientConfig = {
            tokenUrl: LINKEDIN_ADS_TOKEN_URL,
            clientId: session.clientId,
            clientSecret: this.getOAuthClientSecret(session.clientId),
        };
        let grant: Awaited<
            ReturnType<OAuthAuthorizationCodeTokenClient['exchangeCode']>
        >;
        try {
            grant = await this.oauthAuthorizationCodeTokenClient.exchangeCode(
                client,
                { code, redirectUri: session.redirectUri },
            );
        } catch (error) {
            this.logger.warn(
                `LinkedIn sign-in failed: ${getErrorMessage(error)}`,
            );
            throw new WarehouseConnectionError(
                'LinkedIn did not accept the sign-in. Try connecting again.',
            );
        }
        await this.assertCanReadLinkedInAdAccount(
            adAccountId,
            grant.tokens.accessToken,
        );

        const config = withApiSourceAccessRules<CreateExternalConnection>({
            name: session.name,
            type: 'oauth_authorization_code',
            origin: LINKEDIN_ADS_ORIGIN,
            secret: serializeStoredOAuthTokens(grant.tokens),
            apiSource: {
                connector: ApiConnectorType.LINKEDIN_ADS,
                adAccountId,
            },
            oauthTokenUrl: client.tokenUrl,
            oauthClientId: client.clientId,
            oauthClientAuthMethod: null,
            oauthScopes: null,
            apiKeyName: null,
            apiKeyLocation: null,
            allowedPathPrefixes: [],
            allowedMethods: [],
            allowedContentTypes: [],
            allowBrowserImages: false,
            allowDataAppBuilderLinking: false,
            forwardUserIdentity: false,
            instructions: null,
        });
        return this.saveSignedInConnection(account, {
            projectUuid,
            organizationUuid,
            connectionUuid: session.connectionUuid,
            config,
        });
    }

    /** Starts the Google sign-in that creates a source, or reconnects one. */
    async startGoogleOAuth(
        account: RegisteredAccount,
        projectUuid: string,
        request: {
            connector: string;
            name: string;
            explorePrefix?: string;
            connectionUuid: string | null;
        },
    ): Promise<{
        authorizeUrl: string;
        state: string;
        session: GoogleOAuthSession;
    }> {
        const client = this.getGoogleClient();
        if (!client) {
            throw new MissingConfigError(
                'Signing in with Google is not configured on this server',
            );
        }
        await this.assertCanManageLiveSources(account, projectUuid);
        const { connector, connectionUuid, explorePrefix } = request;
        if (!isGoogleConnector(connector)) {
            throw new ParameterError(
                `${connector} is not a Google integration`,
            );
        }
        const name = request.name.trim();
        if (!name) {
            throw new ParameterError('Name is required');
        }
        if (connectionUuid) {
            const existing = await this.getOwnedConnection(
                account,
                projectUuid,
                connectionUuid,
            );
            if (existing.apiSource?.connector !== connector) {
                throw new ParameterError(
                    `Live data source "${existing.name}" does not use ${GOOGLE_CONNECTORS[connector].label}`,
                );
            }
        }

        const state = randomBytes(24).toString('base64url');
        const codeVerifier = randomBytes(32).toString('base64url');
        // The same redirect as Google sign-in, so admins register nothing new.
        const redirectUri = new URL(
            `/api/v1${this.lightdashConfig.auth.google.callbackPath}`,
            this.lightdashConfig.siteUrl,
        ).href;
        return {
            authorizeUrl: buildGoogleAuthorizeUrl({
                clientId: client.clientId,
                redirectUri,
                scope: GOOGLE_CONNECTORS[connector].scope,
                state,
                codeChallenge: createHash('sha256')
                    .update(codeVerifier)
                    .digest('base64url'),
            }),
            state,
            session: {
                projectUuid,
                connector,
                name,
                explorePrefix,
                connectionUuid,
                redirectUri,
                codeVerifier,
            },
        };
    }

    /**
     * Exchanges the sign-in code. Saves the source when there is only one
     * thing it could read, or it is being reconnected; otherwise returns the
     * choices for the admin to pick from.
     */
    async completeGoogleOAuth(
        account: RegisteredAccount,
        session: GoogleOAuthSession,
        code: string,
    ): Promise<
        | { connection: ExternalConnection }
        | { pending: PendingGoogleLiveSource }
    > {
        const client = this.getGoogleClient();
        if (!client) {
            throw new MissingConfigError(
                'Signing in with Google is not configured on this server',
            );
        }
        const { projectUuid, connector } = session;
        const organizationUuid = await this.assertCanManageLiveSources(
            account,
            projectUuid,
        );
        const config = GOOGLE_CONNECTORS[connector];

        let tokens: StoredOAuthTokens;
        try {
            ({ tokens } =
                await this.oauthAuthorizationCodeTokenClient.exchangeCode(
                    { tokenUrl: GOOGLE_TOKEN_URL, ...client },
                    {
                        code,
                        redirectUri: session.redirectUri,
                        codeVerifier: session.codeVerifier,
                    },
                ));
        } catch (error) {
            this.logger.warn(
                `Google sign-in failed: ${getErrorMessage(error)}`,
            );
            throw new WarehouseConnectionError(
                'Google did not accept the sign-in. Try connecting again.',
            );
        }
        if (!tokens.refreshToken) {
            throw new WarehouseConnectionError(
                'Google did not grant offline access. Try connecting again.',
            );
        }
        const choices = await config.listChoices(
            this.googleApi,
            tokens.accessToken,
        );

        if (session.connectionUuid) {
            const existing = await this.getOwnedConnection(
                account,
                projectUuid,
                session.connectionUuid,
            );
            const current = existing.apiSource
                ? config.choiceOf(existing.apiSource)
                : null;
            if (!current || !choices.some(({ value }) => value === current)) {
                throw new ParameterError(
                    `This Google account cannot read ${current ?? 'the source'} in ${config.label}`,
                );
            }
            return {
                connection: await this.saveGoogleConnection(account, {
                    projectUuid,
                    organizationUuid,
                    connector,
                    name: session.name,
                    tokens,
                    choice: current,
                    targetLabel: choices.find(({ value }) => value === current)
                        ?.label,
                    connectionUuid: existing.externalConnectionUuid,
                }),
            };
        }
        if (choices.length === 0) {
            throw new ParameterError(
                `This Google account cannot read anything in ${config.label}`,
            );
        }
        if (choices.length === 1) {
            return {
                connection: await this.saveGoogleConnection(account, {
                    projectUuid,
                    organizationUuid,
                    connector,
                    name: session.name,
                    explorePrefix: session.explorePrefix,
                    tokens,
                    choice: choices[0].value,
                    targetLabel: choices[0].label,
                    connectionUuid: null,
                }),
            };
        }
        return {
            pending: {
                projectUuid,
                connector,
                name: session.name,
                explorePrefix: session.explorePrefix,
                encryptedTokens: this.encryptionUtil
                    .encrypt(serializeStoredOAuthTokens(tokens))
                    .toString('base64'),
                choices,
            },
        };
    }

    /** The choices of a pending Google sign-in, without its tokens. */
    async getPendingGoogleChoice(
        account: RegisteredAccount,
        projectUuid: string,
        pending: PendingGoogleLiveSource | undefined,
    ): Promise<GoogleLiveSourcePendingChoice> {
        await this.assertCanManageLiveSources(account, projectUuid);
        if (!pending || pending.projectUuid !== projectUuid) {
            throw new NotFoundError(
                'No Google sign-in is waiting. Add the source again.',
            );
        }
        return {
            connector: pending.connector,
            name: pending.name,
            choices: pending.choices,
        };
    }

    /** Saves a pending Google sign-in as a source reading the picked property. */
    async finishGoogleOAuth(
        account: RegisteredAccount,
        projectUuid: string,
        pending: PendingGoogleLiveSource | undefined,
        choice: string,
    ): Promise<ExternalConnection> {
        const organizationUuid = await this.assertCanManageLiveSources(
            account,
            projectUuid,
        );
        if (!pending || pending.projectUuid !== projectUuid) {
            throw new NotFoundError(
                'No Google sign-in is waiting. Add the source again.',
            );
        }
        if (!pending.choices.some(({ value }) => value === choice)) {
            throw new ParameterError('Pick one of the listed options');
        }
        const tokens = parseStoredOAuthTokens(
            this.encryptionUtil.decrypt(
                Buffer.from(pending.encryptedTokens, 'base64'),
            ),
        );
        if (!tokens) {
            throw new ParameterError(
                'The Google sign-in expired. Add the source again.',
            );
        }
        return this.saveGoogleConnection(account, {
            projectUuid,
            organizationUuid,
            connector: pending.connector,
            name: pending.name,
            explorePrefix: pending.explorePrefix,
            tokens,
            choice,
            targetLabel: pending.choices.find(({ value }) => value === choice)
                ?.label,
            connectionUuid: null,
        });
    }

    private async saveGoogleConnection(
        account: RegisteredAccount,
        args: {
            projectUuid: string;
            organizationUuid: string;
            connector: GoogleConnectorType;
            name: string;
            explorePrefix?: string;
            tokens: StoredOAuthTokens;
            choice: string;
            targetLabel: string | undefined;
            connectionUuid: string | null;
        },
    ): Promise<ExternalConnection> {
        const client = this.getGoogleClient();
        if (!client) {
            throw new MissingConfigError(
                'Signing in with Google is not configured on this server',
            );
        }
        const google = GOOGLE_CONNECTORS[args.connector];
        const config = withApiSourceAccessRules<CreateExternalConnection>({
            name: args.name,
            ...(args.explorePrefix
                ? { explorePrefix: args.explorePrefix }
                : {}),
            type: 'oauth_authorization_code',
            origin: google.origin,
            secret: serializeStoredOAuthTokens(args.tokens),
            apiSource: google.toApiSource(args.choice),
            oauthTokenUrl: GOOGLE_TOKEN_URL,
            oauthClientId: client.clientId,
            oauthClientAuthMethod: null,
            oauthScopes: null,
            apiKeyName: null,
            apiKeyLocation: null,
            allowedPathPrefixes: [],
            allowedMethods: [],
            allowedContentTypes: [],
            allowBrowserImages: false,
            allowDataAppBuilderLinking: false,
            forwardUserIdentity: false,
            instructions: null,
        });
        return this.saveSignedInConnection(account, {
            projectUuid: args.projectUuid,
            organizationUuid: args.organizationUuid,
            connectionUuid: args.connectionUuid,
            config,
        });
    }

    private static signInExpiredError(connection: ExternalConnection) {
        return new WarehouseConnectionError(
            `The sign-in for live data source "${connection.name}" expired or was revoked. Reconnect it in Live data sources.`,
        );
    }

    /**
     * A usable access token. Refreshes run under the secret's row lock:
     * refresh tokens rotate, so two concurrent refreshes would lock each other out.
     */
    private async getAuthorizationCodeAccessToken(
        connection: ExternalConnection,
        secret: string | null,
        rejectedAccessToken: string | null,
    ): Promise<string> {
        const stored = parseStoredOAuthTokens(secret);
        if (!stored || !connection.oauthTokenUrl || !connection.oauthClientId) {
            throw ExternalConnectionService.signInExpiredError(connection);
        }
        if (
            rejectedAccessToken === null &&
            isAccessTokenFresh(stored, Date.now())
        ) {
            return stored.accessToken;
        }
        const knownAccessToken = rejectedAccessToken ?? stored.accessToken;
        const client: OAuthAuthorizationCodeClientConfig = {
            tokenUrl: connection.oauthTokenUrl,
            clientId: connection.oauthClientId,
            clientSecret: this.getOAuthClientSecret(connection.oauthClientId),
        };

        let latestSecret: string | null;
        try {
            latestSecret =
                await this.externalConnectionModel.updateSecretLocked(
                    connection.externalConnectionUuid,
                    async (current) => {
                        const latest = parseStoredOAuthTokens(current);
                        // Another request refreshed while this one waited for the lock.
                        if (
                            latest &&
                            latest.accessToken !== knownAccessToken &&
                            isAccessTokenFresh(latest, Date.now())
                        ) {
                            return null;
                        }
                        if (!latest?.refreshToken) {
                            throw new OAuthGrantRejectedError(
                                'No refresh token is stored',
                            );
                        }
                        return serializeStoredOAuthTokens(
                            await this.oauthAuthorizationCodeTokenClient.refresh(
                                client,
                                latest.refreshToken,
                            ),
                        );
                    },
                );
        } catch (error) {
            if (error instanceof OAuthGrantRejectedError) {
                throw ExternalConnectionService.signInExpiredError(connection);
            }
            this.logger.warn(
                `Refreshing the access token of connection ${
                    connection.externalConnectionUuid
                } failed: ${getErrorMessage(error)}`,
            );
            throw new UnexpectedServerError(
                `Could not refresh the sign-in for live data source "${connection.name}". Try again shortly.`,
            );
        }
        const latest = parseStoredOAuthTokens(latestSecret);
        if (!latest) {
            throw ExternalConnectionService.signInExpiredError(connection);
        }
        return latest.accessToken;
    }

    async proxyFetch(
        account: Account,
        projectUuid: string,
        appUuid: string,
        req: ExternalFetchRequest,
    ): Promise<ExternalFetchResponse> {
        const start = performance.now();

        const app = await this.authorizeProxyApp(
            account,
            projectUuid,
            appUuid,
            req.chartContext,
        );

        // 2. Resolve the alias → connection (must be linked to this app).
        const connection = await this.externalConnectionModel.resolveAppAlias(
            appUuid,
            req.connectionAlias,
        );
        if (
            !connection ||
            connection.projectUuid !== app.project_uuid ||
            connection.organizationUuid !== app.organization_uuid
        ) {
            throw new ForbiddenError(
                'This app is not linked to the requested connection',
            );
        }

        // 3. Method allowlist.
        const method: ExternalConnectionMethod = req.method ?? 'GET';
        if (!connection.allowedMethods.includes(method)) {
            throw new ParameterError(
                `Method ${method} is not allowed by this connection`,
            );
        }

        // 4. Shared app/connection rate limit, including embed viewers. This is
        //    the credential owner's global ceiling; per-viewer buckets would
        //    allow aggregate traffic to exceed the configured upstream quota.
        const limit =
            connection.rateLimitPerMinute ??
            ExternalConnectionService.DEFAULT_RATE_LIMIT_PER_MINUTE;
        const window = computeMinuteWindow(new Date());
        const count = await this.externalConnectionModel.incrementRateCounter(
            connection.externalConnectionUuid,
            appUuid,
            window,
        );
        if (count > limit) {
            this.trackFetch({
                account,
                projectUuid,
                appUuid,
                connectionAlias: req.connectionAlias,
                connection,
                method,
                path: req.path,
                status: null,
                outcome: 'rate_limited',
                start,
                requestBytes: 0,
                responseBytes: 0,
            });
            throw new TooManyRequestsError(
                'Rate limit exceeded for this connection',
            );
        }

        // 5. Resolve the secret (only what the auth type needs).
        const secret =
            connection.type === 'none'
                ? null
                : await this.externalConnectionModel.getDecryptedSecret(
                      connection.externalConnectionUuid,
                  );

        // 6. Shared execution path (reused by M5 testConnection).
        let result: {
            response: ExternalFetchResponse;
            requestBytes: number;
            responseBytes: number;
        };
        try {
            result = await this.executeExternalFetch(
                connection,
                secret,
                {
                    method,
                    path: req.path,
                    query: req.query,
                    body: req.body,
                },
                { account, appUuid },
            );
        } catch (error) {
            const isKnown =
                error instanceof ParameterError ||
                error instanceof SecureFetchError;
            const outcome = isKnown ? 'rejected' : 'upstream_error';
            this.trackFetch({
                account,
                projectUuid,
                appUuid,
                connectionAlias: req.connectionAlias,
                connection,
                method,
                path: req.path,
                status: null,
                outcome,
                start,
                requestBytes: 0,
                responseBytes: 0,
            });
            if (error instanceof SecureFetchError) {
                // Reason only — no raw internal detail reaches apps.
                throw new ParameterError(
                    `Upstream request was blocked (${error.reason})`,
                );
            }
            if (error instanceof ParameterError) {
                throw error;
            }
            // Map any unexpected error (e.g. malformed origin, serialization
            // failure) to a generic ParameterError — no stack or upstream detail
            // reaches the client.
            throw new ParameterError('Proxy request failed');
        }

        // 7. Audit the result — never bodies, never the secret.
        this.trackFetch({
            account,
            projectUuid,
            appUuid,
            connectionAlias: req.connectionAlias,
            connection,
            method,
            path: req.path,
            status: result.response.status,
            outcome: result.response.status >= 400 ? 'upstream_error' : 'ok',
            start,
            requestBytes: result.requestBytes,
            responseBytes: result.responseBytes,
        });

        return result.response;
    }

    /**
     * Validate + build + inject + fetch + bound. NO authz, NO rate limit, NO
     * alias resolution — those live in the caller so M5's testConnection can
     * reuse this exact path with an admin-supplied connection.
     */
    private async executeExternalFetch(
        connection: ExternalConnection,
        secret: string | null,
        req: {
            method: ExternalConnectionMethod;
            path: string;
            query?: Record<string, string>;
            /** Set only by connectors, never by a proxy caller. */
            rawQuery?: string;
            body?: unknown;
        },
        context: { account: Account; appUuid: string | null },
    ): Promise<{
        response: ExternalFetchResponse;
        requestBytes: number;
        responseBytes: number;
    }> {
        // Validate + normalize the path against the allowlist.
        const validatedPath = normalizeAndValidatePath(
            req.path,
            connection.allowedPathPrefixes,
        );

        // Start from the app's query; add api_key-in-query if configured.
        const query: Record<string, string> = { ...(req.query ?? {}) };
        const headers: Record<string, string> = {};
        let oauthAccessToken: string | null = null;

        // Admin-configured static headers (e.g. anthropic-version), applied
        // BEFORE auth and Content-Type so proxy-set headers always win.
        // Re-validated at send time so a bad stored row fails closed.
        if (connection.customHeaders) {
            validateCustomHeaders(
                connection.customHeaders,
                connection.apiKeyLocation === 'header'
                    ? connection.apiKeyName
                    : null,
            );
            Object.assign(headers, connection.customHeaders);
        }

        if (connection.type === 'bearer_token') {
            // Fail closed: an authenticated connection must never fall through
            // to an unauthenticated upstream call.
            if (!secret) {
                throw new ParameterError(
                    'Connection is missing its bearer token',
                );
            }
            headers.Authorization = `Bearer ${secret}`;
        } else if (connection.type === 'api_key') {
            if (!secret || !connection.apiKeyName) {
                throw new ParameterError(
                    'Connection is missing its api key configuration',
                );
            }
            if (connection.apiKeyLocation === 'header') {
                // Stored config controls this header name, and the proxy is
                // where it becomes an outbound request — reject sensitive and
                // hop-by-hop headers (Host, Cookie, Content-Length, ...).
                assertSafeApiKeyHeaderName(connection.apiKeyName);
                headers[connection.apiKeyName] = secret;
            } else if (connection.apiKeyLocation === 'query') {
                query[connection.apiKeyName] = secret;
            } else {
                throw new ParameterError(
                    'Connection has an invalid api key location',
                );
            }
        } else if (connection.type === 'google_service_account') {
            // Fail closed: mint a short-lived Google access token from the stored
            // service account keyfile + scopes and inject it as a bearer token.
            if (!secret) {
                throw new ParameterError(
                    'Connection is missing its service account key',
                );
            }
            const scopes = connection.oauthScopes ?? [];
            if (scopes.length === 0) {
                throw new ParameterError(
                    'Connection is missing its OAuth scopes',
                );
            }
            let accessToken: string;
            try {
                accessToken = await this.googleTokenProvider.getAccessToken(
                    secret,
                    scopes,
                );
            } catch {
                // No library/upstream detail reaches the client.
                throw new ParameterError(
                    'Failed to obtain Google access token',
                );
            }
            headers.Authorization = `Bearer ${accessToken}`;
        } else if (connection.type === 'oauth_client_credentials') {
            if (
                !secret ||
                !connection.oauthTokenUrl ||
                !connection.oauthClientId ||
                !connection.oauthClientAuthMethod
            ) {
                throw new ParameterError(
                    'Connection is missing its OAuth client credentials configuration',
                );
            }
            try {
                oauthAccessToken =
                    await this.oauthClientCredentialsTokenProvider.getAccessToken(
                        {
                            tokenUrl: connection.oauthTokenUrl,
                            clientId: connection.oauthClientId,
                            clientAuthMethod: connection.oauthClientAuthMethod,
                            scopes: connection.oauthScopes ?? [],
                        },
                        secret,
                    );
                headers.Authorization = `Bearer ${oauthAccessToken}`;
            } catch {
                throw new ParameterError('Failed to obtain OAuth access token');
            }
        } else if (connection.type === 'oauth_authorization_code') {
            oauthAccessToken = await this.getAuthorizationCodeAccessToken(
                connection,
                secret,
                null,
            );
            headers.Authorization = `Bearer ${oauthAccessToken}`;
        }
        // type === 'none' → no auth injected.

        // Identity comes only from the authenticated principal and the resolved
        // connection/app context. Missing attributes are omitted, not invented.
        // In particular, embed user IDs are not Lightdash user UUIDs.
        if (connection.forwardUserIdentity === true) {
            const { user } = context.account;
            headers[EXTERNAL_CONNECTION_IDENTITY_HEADERS.organizationId] =
                connection.organizationUuid;
            headers[EXTERNAL_CONNECTION_IDENTITY_HEADERS.projectId] =
                connection.projectUuid;
            if (context.appUuid) {
                headers[EXTERNAL_CONNECTION_IDENTITY_HEADERS.appId] =
                    context.appUuid;
            }
            if (user.type === 'registered') {
                headers[EXTERNAL_CONNECTION_IDENTITY_HEADERS.userId] =
                    user.userUuid;
            }
            if (user.email) {
                headers[EXTERNAL_CONNECTION_IDENTITY_HEADERS.userEmail] =
                    user.email;
            }
        }

        // Build the outbound URL server-side (host pinned to origin).
        let url: string;
        try {
            url = buildOutboundUrl(
                connection.origin,
                validatedPath,
                query,
                req.rawQuery,
            );
        } catch (error) {
            if (error instanceof ParameterError) {
                throw error;
            }
            throw new ParameterError('Failed to build outbound URL');
        }

        // Cap the serialized query string length for all methods (incl. GET).
        const urlObj = new URL(url);
        if (
            Buffer.byteLength(urlObj.search, 'utf8') >
            connection.requestMaxBytes
        ) {
            throw new ParameterError(
                `Query string exceeds the maximum of ${connection.requestMaxBytes} bytes`,
            );
        }

        // Non-GET body: server-serialized JSON with server-set Content-Type.
        let body: string | undefined;
        let requestBytes = 0;
        if (req.method !== 'GET') {
            const serialized = serializeRequestBody(req.body);
            if (serialized.bytes > connection.requestMaxBytes) {
                throw new ParameterError(
                    `Request body exceeds the maximum of ${connection.requestMaxBytes} bytes`,
                );
            }
            body = serialized.json;
            requestBytes = serialized.bytes;
            headers['Content-Type'] = 'application/json';
        }

        // Delegate to the SSRF-hardened fetch.
        const fetchResource = () =>
            secureFetch(url, {
                method: req.method,
                body,
                headers,
                timeoutMs: connection.timeoutMs,
                maxResponseBytes: connection.responseMaxBytes,
                allowedContentTypes: connection.allowedContentTypes,
                allowedPrivateHostCidrs: this.allowedPrivateHostCidrs,
            });

        let fetched;
        try {
            fetched = await fetchResource();

            // A resource server can revoke a cached token before its advertised
            // expiry. Refresh and replay once; never loop on persistent 401s.
            if (
                fetched.status === 401 &&
                connection.type === 'oauth_client_credentials' &&
                secret &&
                connection.oauthTokenUrl &&
                connection.oauthClientId &&
                connection.oauthClientAuthMethod
            ) {
                const oauthConfig: OAuthClientCredentialsConfig = {
                    tokenUrl: connection.oauthTokenUrl,
                    clientId: connection.oauthClientId,
                    clientAuthMethod: connection.oauthClientAuthMethod,
                    scopes: connection.oauthScopes ?? [],
                };
                if (oauthAccessToken) {
                    this.oauthClientCredentialsTokenProvider.invalidateAccessToken(
                        oauthConfig,
                        secret,
                        oauthAccessToken,
                    );
                }
                oauthAccessToken =
                    await this.oauthClientCredentialsTokenProvider.getAccessToken(
                        oauthConfig,
                        secret,
                    );
                headers.Authorization = `Bearer ${oauthAccessToken}`;
                fetched = await fetchResource();
            } else if (
                fetched.status === 401 &&
                connection.type === 'oauth_authorization_code' &&
                oauthAccessToken
            ) {
                oauthAccessToken = await this.getAuthorizationCodeAccessToken(
                    connection,
                    secret,
                    oauthAccessToken,
                );
                headers.Authorization = `Bearer ${oauthAccessToken}`;
                fetched = await fetchResource();
            }
        } catch (error) {
            // SecureFetchError propagates: the caller decides how much detail
            // to expose (runtime proxy: reason only; admin test tool: message).
            if (error instanceof SecureFetchError) {
                throw error;
            }
            throw new ParameterError('Upstream request failed');
        }

        // Parse body by content type. Recognize application/json and any
        // structured-syntax "+json" suffix (RFC 6839), e.g. application/geo+json.
        const mediaType = fetched.contentType
            .split(';')[0]
            .trim()
            .toLowerCase();
        const isJson =
            mediaType === 'application/json' || mediaType.endsWith('+json');
        // An upstream can echo request headers. Remove the exact minted token
        // before any response reaches an app, browser, or saved test sample.
        const safeBodyText = oauthAccessToken
            ? fetched.bodyText.split(oauthAccessToken).join('[REDACTED]')
            : fetched.bodyText;
        let parsedBody: unknown = safeBodyText;
        if (isJson) {
            try {
                parsedBody = JSON.parse(safeBodyText);
            } catch {
                parsedBody = safeBodyText; // fall back to raw string
            }
        }

        return {
            response: {
                status: fetched.status,
                contentType: fetched.contentType,
                headers: filterExternalResponseHeaders({
                    headers: fetched.headers,
                    requestUrl: url,
                    queryApiKeyName:
                        connection.type === 'api_key' &&
                        connection.apiKeyLocation === 'query'
                            ? connection.apiKeyName
                            : null,
                }),
                body: parsedBody,
                // Reserved for future use; always false in v1 — oversize responses
                // are rejected (SecureFetchError too_large), not truncated.
                truncated: fetched.truncated,
            },
            requestBytes,
            responseBytes: Buffer.byteLength(fetched.bodyText, 'utf8'),
        };
    }

    /**
     * Runs the shared fetch core for the admin-only test endpoints, forwarding
     * the blocked reason's detail the runtime proxy withholds — the caller
     * manages the connection, so the detail helps them fix it.
     */
    private async executeTestFetch(
        connection: ExternalConnection,
        secret: string | null,
        req: {
            method: ExternalConnectionMethod;
            path: string;
            query?: Record<string, string>;
            body?: unknown;
        },
        account: RegisteredAccount,
    ): Promise<ExternalFetchResponse> {
        try {
            const result = await this.executeExternalFetch(
                connection,
                secret,
                req,
                { account, appUuid: null },
            );
            return result.response;
        } catch (error) {
            if (error instanceof SecureFetchError) {
                throw new ParameterError(
                    `Upstream request was blocked (${error.reason}): ${error.message}`,
                );
            }
            throw error;
        }
    }

    private trackFetch(args: {
        account: Account;
        projectUuid: string;
        appUuid: string;
        connectionAlias: string;
        connection: ExternalConnection;
        method: ExternalConnectionMethod;
        path: string;
        status: number | null;
        outcome: 'ok' | 'rejected' | 'rate_limited' | 'upstream_error';
        start: number;
        requestBytes: number;
        responseBytes: number;
    }): void {
        this.analytics.trackAccount(args.account, {
            event: 'external_connection.fetch',
            properties: {
                organizationId: args.connection.organizationUuid,
                projectId: args.projectUuid,
                appUuid: args.appUuid,
                externalConnectionUuid: args.connection.externalConnectionUuid,
                connectionAlias: args.connectionAlias,
                method: args.method,
                path: args.path,
                status: args.status,
                outcome: args.outcome,
                durationMs: Math.round(performance.now() - args.start),
                requestBytes: args.requestBytes,
                responseBytes: args.responseBytes,
            },
        });
    }

    // Bound the persisted sample so a large response can't bloat the row or
    // the sandbox file. JSON-byte cap + a row cap for array bodies.
    static readonly MAX_SAMPLE_BYTES = 16 * 1024; // 16 KB

    static readonly MAX_SAMPLE_ROWS = 50;

    // Bound storage: a connection keeps a small, human-curated set of samples,
    // and labels are short. The endpoint accepts client-supplied samples, so cap
    // both to keep the table (and the generation prompt) from being abused.
    static readonly MAX_SAMPLES_PER_CONNECTION = 20;

    static readonly MAX_SAMPLE_LABEL_CHARS = 200;

    /**
     * Redaction keys whose values are blanked before persisting a sample.
     * Belt-and-braces guard: executeExternalFetch never returns request
     * headers in the body, but a sample could still echo an auth field.
     */
    private static readonly SAMPLE_REDACT_KEYS = new Set([
        'authorization',
        'api_key',
        'apikey',
        'token',
        'access_token',
        'secret',
        'password',
        'x-api-key',
        'private_key',
    ]);

    /**
     * Recursively redact known secret keys and cap array length. Shared by the
     * request and response sanitizers below.
     */
    private static redactSecretKeys(value: unknown): unknown {
        if (Array.isArray(value)) {
            return value
                .slice(0, ExternalConnectionService.MAX_SAMPLE_ROWS)
                .map((v) => ExternalConnectionService.redactSecretKeys(v));
        }
        if (value && typeof value === 'object') {
            return Object.fromEntries(
                Object.entries(value as Record<string, unknown>).map(([k, v]) =>
                    ExternalConnectionService.SAMPLE_REDACT_KEYS.has(
                        k.toLowerCase(),
                    )
                        ? [k, '[redacted]']
                        : [k, ExternalConnectionService.redactSecretKeys(v)],
                ),
            );
        }
        return value;
    }

    /**
     * Validate a client-supplied sample request against the connection's own
     * contract — the SAME method/path/query/body rules the runtime proxy
     * enforces — so a stored sample is always replayable and its size is bounded
     * by the connection's requestMaxBytes.
     */
    private static validateSampleRequest(
        conn: ExternalConnection,
        request: ExternalConnectionSampleRequest,
    ): void {
        if (!conn.allowedMethods.includes(request.method)) {
            throw new ParameterError(
                `Sample method ${request.method} is not allowed by this connection`,
            );
        }
        // Throws on a malformed path or one outside the allowed prefixes.
        normalizeAndValidatePath(request.path, conn.allowedPathPrefixes);
        if (request.query) {
            for (const [k, v] of Object.entries(request.query)) {
                if (typeof v !== 'string') {
                    throw new ParameterError(
                        `Sample query value for "${k}" must be a string`,
                    );
                }
            }
            if (
                Buffer.byteLength(JSON.stringify(request.query), 'utf8') >
                conn.requestMaxBytes
            ) {
                throw new ParameterError(
                    'Sample query exceeds the connection request size limit',
                );
            }
        }
        if (request.body !== undefined) {
            if (request.method === 'GET') {
                throw new ParameterError(
                    'A GET sample must not include a body',
                );
            }
            const { bytes } = serializeRequestBody(request.body);
            if (bytes > conn.requestMaxBytes) {
                throw new ParameterError(
                    'Sample body exceeds the connection request size limit',
                );
            }
        }
    }

    /**
     * Redact secret-ish keys from a sample request's query/body before
     * persisting. method/path are kept verbatim (already validated).
     */
    private static sanitizeSampleRequest(
        request: ExternalConnectionSampleRequest,
    ): ExternalConnectionSampleRequest {
        return {
            method: request.method,
            path: request.path,
            query: request.query
                ? (ExternalConnectionService.redactSecretKeys(
                      request.query,
                  ) as Record<string, string>)
                : undefined,
            body:
                request.body !== undefined
                    ? ExternalConnectionService.redactSecretKeys(request.body)
                    : undefined,
        };
    }

    /**
     * Sanitize an admin-supplied sample value: cap array length, redact known
     * secret keys, then hard-truncate by JSON byte size. Pure + secret-free
     * — never touches the connection's decrypted credential.
     */
    private static sanitizeSample(sample: unknown): unknown {
        let result = ExternalConnectionService.redactSecretKeys(sample);
        // Hard byte cap: if still over budget, wrap in a truncated note so
        // the persisted blob is always bounded regardless of shape.
        const json = JSON.stringify(result) ?? 'null';
        if (
            Buffer.byteLength(json) > ExternalConnectionService.MAX_SAMPLE_BYTES
        ) {
            const truncated = json.slice(
                0,
                ExternalConnectionService.MAX_SAMPLE_BYTES,
            );
            result = {
                truncated: true,
                preview: truncated.slice(
                    0,
                    ExternalConnectionService.MAX_SAMPLE_BYTES - 64,
                ),
            };
        }
        return result;
    }

    /**
     * Loads a connection and verifies it belongs to the given project.
     * A cross-project or missing UUID is treated as 404 to avoid leaking
     * existence information.
     */
    private async loadConnectionForProject(
        connectionUuid: string,
        projectUuid: string,
    ): Promise<ExternalConnection> {
        const conn =
            await this.externalConnectionModel.findByUuid(connectionUuid);
        if (!conn || conn.projectUuid !== projectUuid) {
            throw new NotFoundError(
                `External connection ${connectionUuid} not found`,
            );
        }
        return conn;
    }

    /**
     * Admin-only "Test connection". Loads the connection, decrypts its
     * secret, and runs a single request through the SAME validation +
     * SSRF-guarded fetch core the runtime proxy uses (`executeExternalFetch`).
     * Returns the bounded response. Does not involve an app.
     */
    async testConnection(
        account: RegisteredAccount,
        projectUuid: string,
        connectionUuid: string,
        req: {
            method?: ExternalConnectionMethod;
            path: string;
            query?: Record<string, string>;
            body?: unknown;
            config?: UpdateExternalConnection;
        },
    ): Promise<ExternalFetchResponse> {
        const storedConnection = await this.loadConnectionForProject(
            connectionUuid,
            projectUuid,
        );
        this.assertCanManage(
            account,
            storedConnection.projectUuid,
            storedConnection.organizationUuid,
        );
        const connection = req.config
            ? ExternalConnectionService.resolveConnectionUpdate(
                  storedConnection,
                  req.config,
              )
            : storedConnection;

        // Method allowlist — mirror the runtime proxy so a test rejects a
        // disallowed method instead of silently sending it.
        const method: ExternalConnectionMethod = req.method ?? 'GET';
        if (!connection.allowedMethods.includes(method)) {
            throw new ParameterError(
                `Method ${method} is not allowed by this connection`,
            );
        }

        const secret =
            connection.type === 'none'
                ? null
                : req.config?.secret ||
                  (await this.externalConnectionModel.getDecryptedSecret(
                      connectionUuid,
                  ));

        return this.executeTestFetch(
            connection,
            secret,
            {
                method,
                path: req.path,
                query: req.query,
                body: req.body,
            },
            account,
        );
    }

    /**
     * Admin-only "Test connection config". Runs a single request through the
     * SAME validation + SSRF-guarded fetch core the runtime proxy uses, but
     * against an UNSAVED config (including the caller-supplied plaintext
     * secret) — persisting nothing. Lets the onboarding wizard verify a
     * connection before it is created.
     */
    async testConfig(
        account: RegisteredAccount,
        projectUuid: string,
        requested: CreateExternalConnection,
        req: {
            method?: ExternalConnectionMethod;
            path: string;
            query?: Record<string, string>;
            body?: unknown;
        },
    ): Promise<ExternalFetchResponse> {
        // Derive the org from the project — never trust the caller — so an org
        // admin cannot test against another org's project.
        const organizationUuid =
            await this.externalConnectionModel.getProjectOrganizationUuid(
                projectUuid,
            );
        if (!organizationUuid) {
            throw new NotFoundError('Project not found');
        }
        this.assertCanManage(account, projectUuid, organizationUuid);
        if (requested.apiSource) await this.assertLiveSourcesEnabled(account);
        ExternalConnectionService.assertNotSignInType(requested.type);

        // Same validation create runs, so a test can never exercise a config we
        // would refuse to store (SSRF guard, auth invariants, bounded limits).
        const data = withApiSourceAccessRules(requested);
        validateExternalConnectionConfig(data, Boolean(data.secret));
        validateApiSourceConnection(data);
        if (data.type === 'google_service_account' && data.secret) {
            validateServiceAccountKeyfile(data.secret);
        }

        const method: ExternalConnectionMethod = req.method ?? 'GET';
        if (!data.allowedMethods.includes(method)) {
            throw new ParameterError(
                `Method ${method} is not allowed by this connection`,
            );
        }

        // In-memory connection — never persisted. Numeric limits fall back to
        // the same defaults create applies, since the proxy core reads them.
        const connection: ExternalConnection = {
            externalConnectionUuid: 'unsaved',
            projectUuid,
            organizationUuid,
            name: data.name,
            slug: 'unsaved',
            type: data.type,
            origin: data.origin,
            allowBrowserImages: data.allowBrowserImages ?? false,
            allowDataAppBuilderLinking:
                data.allowDataAppBuilderLinking ?? false,
            forwardUserIdentity: data.forwardUserIdentity ?? false,
            instructions: data.instructions ?? null,
            allowedPathPrefixes: data.allowedPathPrefixes,
            allowedMethods: data.allowedMethods,
            allowedContentTypes: data.allowedContentTypes,
            responseMaxBytes:
                data.responseMaxBytes ??
                EXTERNAL_CONNECTION_DEFAULTS.responseMaxBytes,
            requestMaxBytes:
                data.requestMaxBytes ??
                EXTERNAL_CONNECTION_DEFAULTS.requestMaxBytes,
            timeoutMs: data.timeoutMs ?? EXTERNAL_CONNECTION_DEFAULTS.timeoutMs,
            rateLimitPerMinute: data.rateLimitPerMinute ?? null,
            apiKeyName: data.apiKeyName ?? null,
            apiKeyLocation: data.apiKeyLocation ?? null,
            oauthScopes: data.oauthScopes ?? null,
            oauthTokenUrl: data.oauthTokenUrl ?? null,
            oauthClientId: data.oauthClientId ?? null,
            oauthClientAuthMethod: data.oauthClientAuthMethod ?? null,
            customHeaders: data.customHeaders ?? null,
            apiSource: data.apiSource ?? null,
            hasSecret: Boolean(data.secret),
            createdByUserUuid: null,
            updatedByUserUuid: null,
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        const secret = data.type === 'none' ? null : (data.secret ?? null);

        return this.executeTestFetch(
            connection,
            secret,
            {
                method,
                path: req.path,
                query: req.query,
                body: req.body,
            },
            account,
        );
    }

    /**
     * Admin-only. Ask an LLM to propose a connection config (plus a credential
     * how-to guide) from a prose description. Persists nothing and never
     * touches secrets — the proposal prefills the create wizard, where the
     * user reviews every field and pastes the credential themselves.
     */
    async proposeConfig(
        account: RegisteredAccount,
        projectUuid: string,
        description: string,
    ): Promise<ExternalConnectionConfigProposal> {
        // Derive the org from the project — never trust the caller — so an org
        // admin cannot propose against another org's project.
        const organizationUuid =
            await this.externalConnectionModel.getProjectOrganizationUuid(
                projectUuid,
            );
        if (!organizationUuid) {
            throw new NotFoundError('Project not found');
        }
        this.assertCanManage(account, projectUuid, organizationUuid);

        const trimmed = description.trim();
        if (!trimmed) {
            throw new ParameterError('Description is required');
        }
        if (
            trimmed.length >
            ExternalConnectionService.MAX_PROPOSAL_DESCRIPTION_CHARS
        ) {
            throw new ParameterError(
                `Description must be at most ${ExternalConnectionService.MAX_PROPOSAL_DESCRIPTION_CHARS} characters`,
            );
        }

        const copilot = await this.orgAiCopilotConfigResolver.getCopilotConfig({
            organizationUuid,
            projectUuid,
            credentialUuid: null,
        });
        const provider: 'anthropic' | 'bedrock' =
            copilot.defaultProvider === 'bedrock' ? 'bedrock' : 'anthropic';

        let modelOptions: GeneratorModelOptions;
        try {
            modelOptions = {
                ...getModel(copilot, {
                    provider,
                    modelName: 'claude-sonnet-4-5',
                    enableReasoning: false,
                }),
                telemetry: {
                    organizationUuid,
                    projectUuid,
                    userUuid: account.user.id,
                },
            };
        } catch (error) {
            this.logger.info(
                `Cannot propose connection config: ${provider} not configured (${getErrorMessage(
                    error,
                )})`,
            );
            throw new MissingConfigError(
                'AI is not configured for this organization',
            );
        }

        return generateExternalConnectionConfigProposal(modelOptions, trimmed);
    }

    /**
     * Admin-only. Persist a named, sanitized sample (request + response) in
     * the samples collection. Stores NO secret material — never calls
     * getDecryptedSecret.
     */
    async saveSample(
        account: RegisteredAccount,
        projectUuid: string,
        connectionUuid: string,
        data: ApiSaveExternalConnectionSampleRequest,
    ): Promise<ExternalConnectionSample> {
        const conn = await this.loadConnectionForProject(
            connectionUuid,
            projectUuid,
        );
        this.assertCanManage(account, conn.projectUuid, conn.organizationUuid);

        // Validate the client-supplied request against the connection contract
        // before persisting, so a stored sample is always replayable + bounded.
        ExternalConnectionService.validateSampleRequest(conn, data.request);

        // Cap the number of stored samples per connection.
        const existingCount =
            await this.externalConnectionModel.countSamples(connectionUuid);
        if (
            existingCount >=
            ExternalConnectionService.MAX_SAMPLES_PER_CONNECTION
        ) {
            throw new ParameterError(
                `This connection already has the maximum of ${ExternalConnectionService.MAX_SAMPLES_PER_CONNECTION} saved samples. Delete one before saving another.`,
            );
        }

        const label =
            data.label != null
                ? data.label.slice(
                      0,
                      ExternalConnectionService.MAX_SAMPLE_LABEL_CHARS,
                  )
                : null;

        return this.externalConnectionModel.saveSample(
            connectionUuid,
            account.user.id,
            {
                label,
                request: ExternalConnectionService.sanitizeSampleRequest(
                    data.request,
                ),
                response: ExternalConnectionService.sanitizeSample(
                    data.response,
                ),
            },
        );
    }

    /**
     * Admin-only. List all samples saved for a connection, most recent first.
     */
    async listSamples(
        account: RegisteredAccount,
        projectUuid: string,
        connectionUuid: string,
    ): Promise<ExternalConnectionSample[]> {
        const conn = await this.loadConnectionForProject(
            connectionUuid,
            projectUuid,
        );
        this.assertCanManage(account, conn.projectUuid, conn.organizationUuid);
        return this.externalConnectionModel.listSamples(connectionUuid);
    }

    /**
     * Admin-only. Delete a single sample by UUID. Verifies the sample belongs
     * to the given connection (which must be in the given project).
     */
    async deleteSample(
        account: RegisteredAccount,
        projectUuid: string,
        connectionUuid: string,
        sampleUuid: string,
    ): Promise<void> {
        const conn = await this.loadConnectionForProject(
            connectionUuid,
            projectUuid,
        );
        this.assertCanManage(account, conn.projectUuid, conn.organizationUuid);

        const ownerConnectionUuid =
            await this.externalConnectionModel.getSampleConnectionUuid(
                sampleUuid,
            );
        if (ownerConnectionUuid !== connectionUuid) {
            throw new NotFoundError('Sample not found');
        }
        await this.externalConnectionModel.deleteSample(sampleUuid);
    }
}
