import {
    AuthorizationError,
    CreateDatabricksCredentials,
    DatabricksAuthenticationType,
    DatabricksTokenError,
    getErrorMessage,
    LightdashError,
    NotFoundError,
    ParameterError,
    UnexpectedServerError,
    WarehouseTypes,
    type SessionUser,
    type UpsertUserWarehouseCredentials,
} from '@lightdash/common';
import {
    DATABRICKS_DEFAULT_OAUTH_CLIENT_ID,
    exchangeDatabricksOAuthCredentials,
    isDatabricksCliOAuthClientId,
    refreshDatabricksOAuthToken,
} from '@lightdash/warehouses';
import passport from 'passport';
import type { LightdashConfig } from '../../config/parseConfig';
import {
    createDatabricksStrategy,
    getDatabricksOidcEndpointsFromHost,
    getDatabricksStrategyName,
    normalizeDatabricksHostLenient,
} from '../../controllers/authentication/strategies/databricksStrategy';
import type { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import type { UserWarehouseCredentialsModel } from '../../models/UserWarehouseCredentials/UserWarehouseCredentialsModel';
import { BaseService } from '../BaseService';

type DatabricksLoginConfig = {
    projectUuid?: string;
    clientId: string;
    clientSecret?: string;
    authorizationURL: string;
    tokenURL: string;
    issuer: string;
    strategyName: string;
};

// Module-level strategy cache — survives service re-creation.
const DATABRICKS_STRATEGY_TTL_MS = 10 * 60 * 1000;
const databricksStrategyCache = new Map<
    string,
    { timer: ReturnType<typeof setTimeout> }
>();

type DatabricksOAuthServiceDependencies = {
    lightdashConfig: LightdashConfig;
    userWarehouseCredentialsModel: UserWarehouseCredentialsModel;
    projectModel: ProjectModel;
};

export class DatabricksOAuthService extends BaseService {
    private lightdashConfig: LightdashConfig;

    private userWarehouseCredentialsModel: UserWarehouseCredentialsModel;

    private projectModel: ProjectModel;

    constructor(deps: DatabricksOAuthServiceDependencies) {
        super({ serviceName: 'DatabricksOAuthService' });
        this.lightdashConfig = deps.lightdashConfig;
        this.userWarehouseCredentialsModel = deps.userWarehouseCredentialsModel;
        this.projectModel = deps.projectModel;
    }

    // ─── Client Resolution ────────────────────────────────────────────

    /**
     * Resolve OAuth client for browser login flows.
     * Rejects CLI-only client IDs (their redirect URIs don't work in browsers).
     * Throws if no usable client is configured.
     */
    resolveOAuthClientForLogin(
        oauthClientId?: string,
        oauthClientSecret?: string,
    ): { clientId: string; clientSecret?: string } {
        if (oauthClientId && !isDatabricksCliOAuthClientId(oauthClientId)) {
            return { clientId: oauthClientId, clientSecret: oauthClientSecret };
        }
        if (this.lightdashConfig.auth.databricks.clientId) {
            return {
                clientId: this.lightdashConfig.auth.databricks.clientId,
                clientSecret: this.lightdashConfig.auth.databricks.clientSecret,
            };
        }
        throw new AuthorizationError(
            'Databricks OAuth client is not configured',
        );
    }

    /**
     * Resolve OAuth client for token refresh.
     * Falls back to CLI default if nothing else is configured.
     */
    resolveOAuthClientForRefresh(
        oauthClientId?: string,
        oauthClientSecret?: string,
    ): { clientId: string; clientSecret?: string } {
        if (oauthClientId) {
            return { clientId: oauthClientId, clientSecret: oauthClientSecret };
        }
        if (this.lightdashConfig.auth.databricks.clientId) {
            return {
                clientId: this.lightdashConfig.auth.databricks.clientId,
                clientSecret: this.lightdashConfig.auth.databricks.clientSecret,
            };
        }
        return {
            clientId: DATABRICKS_DEFAULT_OAUTH_CLIENT_ID,
            clientSecret: undefined,
        };
    }

    // ─── Token Refresh ────────────────────────────────────────────────

    /**
     * Refresh Databricks credentials (M2M or U2M).
     * Replaces the ~150 lines previously in ProjectService.refreshCredentials().
     */
    async refreshCredentials(
        args: CreateDatabricksCredentials,
    ): Promise<CreateDatabricksCredentials> {
        if (
            args.authenticationType === DatabricksAuthenticationType.OAUTH_M2M
        ) {
            return this.refreshM2MCredentials(args);
        }
        if (
            args.authenticationType === DatabricksAuthenticationType.OAUTH_U2M
        ) {
            return this.refreshU2MCredentials(args);
        }
        return args;
    }

    private async refreshM2MCredentials(
        args: CreateDatabricksCredentials,
    ): Promise<CreateDatabricksCredentials> {
        try {
            // Try client_credentials grant when we have client creds but no refresh token
            if (
                args.oauthClientId &&
                args.oauthClientSecret &&
                !args.refreshToken
            ) {
                this.logger.debug(
                    'Exchanging Databricks M2M client credentials for access token',
                );
                const { accessToken, refreshToken } =
                    await exchangeDatabricksOAuthCredentials(
                        args.serverHostName,
                        args.oauthClientId,
                        args.oauthClientSecret,
                    );
                return {
                    ...args,
                    authenticationType: DatabricksAuthenticationType.OAUTH_M2M,
                    token: accessToken,
                    refreshToken,
                };
            }

            if (!args.refreshToken) {
                throw new Error(
                    'No refresh token or OAuth credentials available for Databricks OAuth authentication',
                );
            }

            this.logger.debug('Refreshing Databricks M2M OAuth token');

            const { clientId, clientSecret } =
                this.resolveOAuthClientForRefresh(
                    args.oauthClientId,
                    args.oauthClientSecret,
                );

            const { accessToken, refreshToken: newRefreshToken } =
                await refreshDatabricksOAuthToken(
                    args.serverHostName,
                    clientId,
                    args.refreshToken,
                    clientSecret,
                );

            return {
                ...args,
                authenticationType: DatabricksAuthenticationType.OAUTH_M2M,
                token: accessToken,
                refreshToken: newRefreshToken || args.refreshToken,
            };
        } catch (e: unknown) {
            if (e instanceof LightdashError) {
                throw e;
            }
            this.logger.error(
                `Error refreshing Databricks M2M token: ${getErrorMessage(e)}`,
            );
            throw new UnexpectedServerError(
                'Error refreshing databricks token',
            );
        }
    }

    private async refreshU2MCredentials(
        args: CreateDatabricksCredentials,
    ): Promise<CreateDatabricksCredentials> {
        try {
            if (!args.refreshToken) {
                throw new Error(
                    'No refresh token available for Databricks U2M OAuth authentication',
                );
            }

            this.logger.debug('Refreshing Databricks U2M OAuth token');

            // Resolve client ID. U2M credentials store the clientId that obtained the token.
            const { clientId } = this.resolveOAuthClientForRefresh(
                args.oauthClientId,
            );

            // Secret is only used when the clientId matches the server config
            // (never stored in DB for U2M — only the server knows it).
            let clientSecret: string | undefined;
            if (clientId === this.lightdashConfig.auth.databricks.clientId) {
                clientSecret =
                    this.lightdashConfig.auth.databricks.clientSecret;
            }

            const { accessToken, refreshToken: newRefreshToken } =
                await refreshDatabricksOAuthToken(
                    args.serverHostName,
                    clientId,
                    args.refreshToken,
                    clientSecret,
                );

            return {
                ...args,
                authenticationType: DatabricksAuthenticationType.OAUTH_U2M,
                token: accessToken,
                refreshToken: newRefreshToken,
            };
        } catch (e: unknown) {
            if (e instanceof LightdashError) {
                throw e;
            }
            const errorMessage = `Error refreshing databricks U2M OAuth token: ${getErrorMessage(e)}`;
            this.logger.error(errorMessage);
            throw new DatabricksTokenError(errorMessage);
        }
    }

    // ─── Login / Strategy Management ──────────────────────────────────

    /**
     * Resolve Databricks OAuth config for a login request.
     * Moved from apiV1Router.resolveDynamicDatabricksOauthConfig().
     */
    async resolveLoginConfig(params: {
        projectUuid?: string;
        serverHostName?: string;
        issuerUrl?: string;
    }): Promise<DatabricksLoginConfig | undefined> {
        let { serverHostName } = params;
        let projectClientId: string | undefined;
        let projectClientSecret: string | undefined;
        const { projectUuid } = params;

        if (projectUuid) {
            const credentials =
                await this.projectModel.getWarehouseCredentialsForProject(
                    projectUuid,
                );
            if (credentials.type !== WarehouseTypes.DATABRICKS) {
                throw new ParameterError(
                    'Project is not configured with Databricks credentials',
                );
            }
            serverHostName = credentials.serverHostName;
            projectClientId = credentials.oauthClientId;
            projectClientSecret = credentials.oauthClientSecret;
        }

        // Fallback: extract host from OIDC issuer URL
        if (!serverHostName && params.issuerUrl) {
            try {
                serverHostName = new URL(params.issuerUrl).host;
            } catch {
                // ignore invalid issuer
            }
        }

        if (!serverHostName) {
            return undefined;
        }

        const { clientId, clientSecret } = this.resolveOAuthClientForLogin(
            projectClientId,
            projectClientSecret,
        );

        const oidc = getDatabricksOidcEndpointsFromHost(serverHostName);
        return {
            projectUuid,
            clientId,
            clientSecret,
            authorizationURL: oidc.authorizationURL,
            tokenURL: oidc.tokenURL,
            issuer: oidc.issuer,
            strategyName: getDatabricksStrategyName({
                host: oidc.host,
                clientId,
                clientSecret,
            }),
        };
    }

    /**
     * Get or create a cached Passport strategy for a Databricks login config.
     * Moved from apiV1Router.getOrCreateDatabricksStrategy().
     */
    getOrCreateStrategy(config: DatabricksLoginConfig): string {
        const { strategyName } = config;
        const existing = databricksStrategyCache.get(strategyName);
        if (existing) {
            clearTimeout(existing.timer);
            existing.timer = setTimeout(() => {
                databricksStrategyCache.delete(strategyName);
                passport.unuse(strategyName);
            }, DATABRICKS_STRATEGY_TTL_MS);
            return strategyName;
        }

        this.logger.debug(
            `Registering Databricks passport strategy: ${strategyName}`,
        );
        passport.use(strategyName, createDatabricksStrategy(config));
        const timer = setTimeout(() => {
            databricksStrategyCache.delete(strategyName);
            passport.unuse(strategyName);
        }, DATABRICKS_STRATEGY_TTL_MS);
        databricksStrategyCache.set(strategyName, { timer });
        return strategyName;
    }

    // ─── Credential Upsert ───────────────────────────────────────────

    /**
     * Create or update Databricks U2M user warehouse credentials.
     * Simplified from UserService.createDatabricksWarehouseCredentials().
     *
     * Returns the UUID of the created/updated credential, or undefined
     * if no credential was created (delegates actual CRUD to the model).
     */
    async upsertUserCredentials(
        userUuid: string,
        refreshToken: string,
        options?: {
            projectUuid?: string;
            serverHostName?: string;
            oauthClientId?: string;
            credentialsName?: string;
        },
    ): Promise<string> {
        let serverHostName = options?.serverHostName?.trim();

        // Resolve host from project credentials when not provided directly
        if (!serverHostName && options?.projectUuid) {
            const credentials =
                await this.projectModel.getWarehouseCredentialsForProject(
                    options.projectUuid,
                );
            if (credentials.type === WarehouseTypes.DATABRICKS) {
                serverHostName = credentials.serverHostName;
            }
        }
        const credentialsName =
            options?.credentialsName?.trim() ||
            (serverHostName ? `Databricks (${serverHostName})` : 'Default');

        const data: UpsertUserWarehouseCredentials = {
            name: credentialsName,
            credentials: {
                type: WarehouseTypes.DATABRICKS,
                authenticationType: DatabricksAuthenticationType.OAUTH_U2M,
                refreshToken,
                serverHostName,
                oauthClientId: options?.oauthClientId,
            },
        };

        // Try to find an existing credential to update
        const existing = await this.findExistingCredential(
            userUuid,
            serverHostName,
            options?.projectUuid,
        );

        if (existing) {
            await this.userWarehouseCredentialsModel.update(
                userUuid,
                existing.uuid,
                data,
            );
            return existing.uuid;
        }

        // Create new
        return this.userWarehouseCredentialsModel.create(
            userUuid,
            data,
            options?.projectUuid,
        );
    }

    private async findExistingCredential(
        userUuid: string,
        serverHostName?: string,
        projectUuid?: string,
    ): Promise<{ uuid: string } | undefined> {
        // 1. Try host-based match (most specific)
        if (serverHostName) {
            const hostMatch =
                await this.userWarehouseCredentialsModel.findDatabricksOauthU2mForHostWithSecrets(
                    userUuid,
                    serverHostName,
                    projectUuid
                        ? { projectUuid }
                        : { includeProjectScoped: false },
                );
            if (hostMatch) return hostMatch;
        }

        // 2. For project-scoped: try any Databricks credential for this project
        if (projectUuid) {
            const projectMatch =
                await this.userWarehouseCredentialsModel.findForProject(
                    projectUuid,
                    userUuid,
                    WarehouseTypes.DATABRICKS,
                );
            if (projectMatch) return projectMatch;
        }

        return undefined;
    }

    // ─── Authentication Check ─────────────────────────────────────────

    /**
     * Check if user has valid Databricks OAuth credentials.
     * Consolidates the 3-branch logic from DatabricksSSOController.
     * Throws NotFoundError if not authenticated.
     */
    async checkIsAuthenticated(
        user: SessionUser,
        params: { projectUuid?: string; serverHostName?: string },
    ): Promise<void> {
        if (params.projectUuid) {
            const credentials =
                await this.userWarehouseCredentialsModel.findForProject(
                    params.projectUuid,
                    user.userUuid,
                    WarehouseTypes.DATABRICKS,
                );
            if (!credentials) {
                throw new NotFoundError(
                    'Databricks credentials not found for this project',
                );
            }
            return;
        }

        if (params.serverHostName) {
            const credential =
                await this.userWarehouseCredentialsModel.findDatabricksOauthU2mForHostWithSecrets(
                    user.userUuid,
                    params.serverHostName,
                );
            if (!credential) {
                throw new NotFoundError(
                    'Databricks credentials not found for this workspace',
                );
            }
            return;
        }

        // Fallback: check any Databricks credential exists
        // (legacy behavior for non-project-scoped checks)
        throw new NotFoundError(
            'No project or workspace specified for Databricks authentication check',
        );
    }
}
