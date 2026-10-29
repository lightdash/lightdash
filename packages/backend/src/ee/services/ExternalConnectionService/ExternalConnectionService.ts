import { subject } from '@casl/ability';
import {
    ApiConnectorType,
    assertRegisteredAccount,
    assertUnreachable,
    DATA_APP_VIZ_TEMPLATE,
    EXTERNAL_CONNECTION_DEFAULTS,
    EXTERNAL_CONNECTION_IDENTITY_HEADERS,
    FeatureFlags,
    ForbiddenError,
    getErrorMessage,
    isJwtUser,
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
    type CreateExternalConnection,
    type ExternalConnection,
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
    type RegisteredAccount,
    type UpdateExternalConnection,
} from '@lightdash/common';
import isEqual from 'lodash/isEqual';
import { createHash, randomBytes } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { LightdashAnalytics } from '../../../analytics/LightdashAnalytics';
import { toSessionUser } from '../../../auth/account';
import { type LightdashConfig } from '../../../config/parseConfig';
import { type AppModel } from '../../../models/AppModel';
import type { FeatureFlagModel } from '../../../models/FeatureFlagModel/FeatureFlagModel';
import { BaseService } from '../../../services/BaseService';
import type {
    ApiConnector,
    ApiConnectorTransport,
} from '../../../services/QuerySourceService/api/ApiConnector';
import { Ga4Connector } from '../../../services/QuerySourceService/api/google/Ga4Connector';
import { SearchConsoleConnector } from '../../../services/QuerySourceService/api/google/SearchConsoleConnector';
import { PostHogConnector } from '../../../services/QuerySourceService/api/posthog/PostHogConnector';
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
import { type ExternalConnectionModel } from '../../models/ExternalConnectionModel';
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
    GOOGLE_TOKEN_URL,
    isGoogleConnector,
    type GoogleApiGet,
    type GoogleConnectorType,
} from './googleOAuth';
import { type GoogleServiceAccountTokenProvider } from './GoogleServiceAccountTokenProvider';
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
    getPostHogOAuthEndpoints,
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
    encryptionUtil: Pick<EncryptionUtil, 'encrypt' | 'decrypt'>;
    lightdashConfig: Pick<LightdashConfig, 'siteUrl' | 'liveSources' | 'auth'>;
};

export type PostHogRegion = keyof typeof POSTHOG_REGION_ORIGINS;

/** What the sign-in callback needs from the request that started it. */
export type PostHogOAuthSession = {
    projectUuid: string;
    region: PostHogRegion;
    name: string;
    connectionUuid: string | null;
    clientId: string;
    redirectUri: string;
    codeVerifier: string;
};

/** What the Google sign-in callback needs from the request that started it. */
export type GoogleOAuthSession = {
    projectUuid: string;
    connector: GoogleConnectorType;
    name: string;
    connectionUuid: string | null;
    redirectUri: string;
    codeVerifier: string;
};

/** A Google sign-in that can read several properties, waiting for the admin to pick one. */
export type PendingGoogleLiveSource = {
    projectUuid: string;
    connector: GoogleConnectorType;
    name: string;
    /** The granted tokens, encrypted while they wait in the session. */
    encryptedTokens: string;
    choices: GoogleLiveSourceChoice[];
};

const GOOGLE_API_TIMEOUT_MS = 10_000;
const GOOGLE_API_RESPONSE_MAX_BYTES = 1024 * 1024;

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
        const connection = await this.externalConnectionModel.create(
            projectUuid,
            organizationUuid,
            account.user.id,
            config,
            options,
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
                'A live data source cannot drop its connector settings',
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
        return updated;
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

    /**
     * A connector for a live api query. The stored secret never leaves this
     * service: requests go through the same guarded fetch as the app proxy.
     */
    async getApiConnector(
        account: RegisteredAccount,
        projectUuid: string,
        connectionUuid: string,
    ): Promise<ApiConnector> {
        const connection = await this.getViewableConnection(
            account,
            projectUuid,
            connectionUuid,
        );
        const { apiSource } = connection;
        if (connection.kind !== 'live_source' || !apiSource) {
            throw new ParameterError(
                `Connection "${connection.name}" is not set up for live queries`,
            );
        }
        let connector: ApiConnector;
        let callsThisQuery = 0;
        const sendOnce: ApiConnectorTransport = async (request) => {
            const secret =
                await this.externalConnectionModel.getDecryptedSecret(
                    connection.externalConnectionUuid,
                );
            try {
                const { response } = await this.executeExternalFetch(
                    connection,
                    secret,
                    {
                        method: request.method,
                        path: request.path,
                        body: request.body,
                    },
                    { account, appUuid: null },
                );
                return {
                    status: response.status,
                    headers: response.headers,
                    body: response.body,
                };
            } catch (error) {
                if (error instanceof SecureFetchError) {
                    if (error.reason === 'timeout') {
                        throw new TimeoutError(
                            `Connection "${connection.name}" did not respond within ${
                                connection.timeoutMs / 1000
                            } seconds`,
                        );
                    }
                    throw new ParameterError(
                        `Request to connection "${connection.name}" was blocked (${error.reason})`,
                    );
                }
                throw error;
            }
        };
        const send: ApiConnectorTransport = async (request) => {
            const { label, limits } = connector.describe();
            callsThisQuery += 1;
            if (callsThisQuery > limits.callsPerQuery) {
                throw new ParameterError(
                    `This query needs more than ${limits.callsPerQuery} ${label} API calls. Narrow it with filters or a shorter time range.`,
                );
            }
            return this.apiSourceCallLimiter.run(connection, limits, () =>
                sendOnce(request),
            );
        };
        switch (apiSource.connector) {
            case ApiConnectorType.POSTHOG:
                connector = new PostHogConnector({
                    projectId: apiSource.projectId,
                    send,
                });
                return connector;
            case ApiConnectorType.SEARCH_CONSOLE:
                connector = new SearchConsoleConnector({
                    siteUrl: apiSource.siteUrl,
                    send,
                });
                return connector;
            case ApiConnectorType.GA4:
                connector = new Ga4Connector({
                    propertyId: apiSource.propertyId,
                    send,
                });
                return connector;
            default:
                return assertUnreachable(apiSource, 'Unknown api connector');
        }
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

    /** Where the sign-in callback lands, with its outcome for the settings page to show. */
    getLiveDataSourcesUrl(
        projectUuid: string,
        result:
            | { connectionUuid: string }
            | { error: string }
            | { pickGoogleSource: true },
    ): string {
        const url = new URL(
            `/generalSettings/projectManagement/${projectUuid}/liveDataSources`,
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

    /** Starts the PostHog sign-in that creates a source, or reconnects one. */
    async startPostHogOAuth(
        account: RegisteredAccount,
        projectUuid: string,
        request: {
            region: string;
            name: string;
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
        const { region, connectionUuid } = request;
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
            if (existing.apiSource?.connector !== ApiConnectorType.POSTHOG) {
                throw new ParameterError(
                    `Connection "${existing.name}" is not a PostHog source`,
                );
            }
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

        const config = withApiSourceAccessRules<CreateExternalConnection>({
            name: session.name,
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
        }: {
            projectUuid: string;
            organizationUuid: string;
            connectionUuid: string | null;
            config: CreateExternalConnection;
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
            return updated;
        }

        const connection = await this.externalConnectionModel.create(
            projectUuid,
            organizationUuid,
            account.user.id,
            config,
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

    private readonly getGoogleApi: GoogleApiGet = async (url, accessToken) => {
        const response = await secureFetch(url, {
            method: 'GET',
            headers: { Authorization: `Bearer ${accessToken}` },
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

    /** Starts the Google sign-in that creates a source, or reconnects one. */
    async startGoogleOAuth(
        account: RegisteredAccount,
        projectUuid: string,
        request: {
            connector: string;
            name: string;
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
        const { connector, connectionUuid } = request;
        if (!isGoogleConnector(connector)) {
            throw new ParameterError(`${connector} is not a Google source`);
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
                    `Connection "${existing.name}" is not a ${GOOGLE_CONNECTORS[connector].label} source`,
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
            this.getGoogleApi,
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
                    tokens,
                    choice: choices[0].value,
                    connectionUuid: null,
                }),
            };
        }
        return {
            pending: {
                projectUuid,
                connector,
                name: session.name,
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
            tokens,
            choice,
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
            tokens: StoredOAuthTokens;
            choice: string;
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
            `The sign-in for connection "${connection.name}" expired or was revoked. Reconnect it in Live data sources.`,
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
                `Could not refresh the sign-in for connection "${connection.name}". Try again shortly.`,
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
            url = buildOutboundUrl(connection.origin, validatedPath, query);
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
