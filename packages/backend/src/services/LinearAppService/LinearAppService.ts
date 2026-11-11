import { subject } from '@casl/ability';
import {
    ForbiddenError,
    getErrorMessage,
    isUserWithOrg,
    LINEAR_CONNECT_ERROR_PARAM,
    LinearConnectError,
    ParameterError,
    SessionUser,
    type LightdashUserWithOrg,
    type LinearCreatedIssue,
    type LinearInstallation,
    type LinearOAuthCredentials,
    type LinearProject,
    type LinearTeam,
} from '@lightdash/common'; // pragma: allowlist secret
import { SessionData } from 'express-session';
import { type Knex } from 'knex';
import { nanoid } from 'nanoid';
import { createHash, randomBytes } from 'node:crypto';
import { LightdashAnalytics } from '../../analytics/LightdashAnalytics'; // pragma: allowlist secret
import {
    createLinearIssue,
    exchangeLinearCodeForToken,
    getLinearAuthorizationUrl,
    getLinearOrganization,
    getLinearProjects,
    getLinearTeams,
    LinearTokenRequestError,
    linkLinearIssueUrl,
    refreshLinearToken,
} from '../../clients/linear/Linear';
import { LightdashConfig } from '../../config/parseConfig'; // pragma: allowlist secret
import { LinearAppInstallationsModel } from '../../models/LinearAppInstallations/LinearAppInstallationsModel';
import { EncryptionUtil } from '../../utils/EncryptionUtil/EncryptionUtil';
import { BaseService } from '../BaseService';

const MAX_CREDENTIAL_LENGTH = 255;

type LinearAppServiceArguments = {
    linearAppInstallationsModel: LinearAppInstallationsModel;
    encryptionUtil: EncryptionUtil;
    lightdashConfig: LightdashConfig; // pragma: allowlist secret
    analytics: LightdashAnalytics; // pragma: allowlist secret
    onWorkspaceChanged?: (
        organizationUuid: string,
        trx: Knex.Transaction,
    ) => Promise<void>;
    onInstallationDeleted?: (
        organizationUuid: string,
        trx: Knex.Transaction,
    ) => Promise<void>;
};

export class LinearAppService extends BaseService {
    private readonly linearAppInstallationsModel: LinearAppInstallationsModel;

    private readonly encryptionUtil: EncryptionUtil;

    private readonly analytics: LightdashAnalytics; // pragma: allowlist secret

    private readonly lightdashConfig: LightdashConfig; // pragma: allowlist secret

    private readonly onWorkspaceChanged: NonNullable<
        LinearAppServiceArguments['onWorkspaceChanged']
    >;

    private readonly onInstallationDeleted: NonNullable<
        LinearAppServiceArguments['onInstallationDeleted']
    >;

    constructor(args: LinearAppServiceArguments) {
        super();
        this.linearAppInstallationsModel = args.linearAppInstallationsModel;
        this.encryptionUtil = args.encryptionUtil;
        this.lightdashConfig = args.lightdashConfig;
        this.analytics = args.analytics;
        this.onWorkspaceChanged =
            args.onWorkspaceChanged ?? (() => Promise.resolve());
        this.onInstallationDeleted =
            args.onInstallationDeleted ?? (() => Promise.resolve());
    }

    private canManageOrg(
        user: SessionUser,
    ): asserts user is SessionUser & LightdashUserWithOrg {
        if (!isUserWithOrg(user)) {
            throw new Error('User is not part of an organization');
        }
        const auditedAbility = this.createAuditedAbility(user);
        if (
            !auditedAbility.can(
                'manage',
                subject('Organization', {
                    organizationUuid: user.organizationUuid,
                }),
            )
        ) {
            throw new ForbiddenError(
                'User does not have permission to manage organization',
            );
        }
    }

    private getRedirectUri() {
        return new URL(
            '/api/v1/linear/oauth/callback',
            this.lightdashConfig.siteUrl, // pragma: allowlist secret
        ).href;
    }

    private static validateCredentials(
        credentials: LinearOAuthCredentials,
    ): LinearOAuthCredentials {
        const clientId = credentials.clientId.trim();
        const clientSecret = credentials.clientSecret.trim();
        if (!clientId || clientId.length > MAX_CREDENTIAL_LENGTH) {
            throw new ParameterError('Linear OAuth client ID is invalid');
        }
        if (!clientSecret || clientSecret.length > MAX_CREDENTIAL_LENGTH) {
            throw new ParameterError('Linear OAuth client secret is invalid');
        }
        return { clientId, clientSecret };
    }

    private async getStoredCredentials(
        organizationUuid: string,
    ): Promise<LinearOAuthCredentials> {
        const { clientId, clientSecret } =
            await this.linearAppInstallationsModel.getAuth(organizationUuid);
        if (!clientId || !clientSecret) {
            throw new ParameterError(
                'Enter the Linear OAuth client ID and client secret to reconnect',
            );
        }
        return { clientId, clientSecret };
    }

    async installRedirect(
        user: SessionUser,
        credentials: LinearOAuthCredentials | null,
    ) {
        this.canManageOrg(user);
        const { clientId, clientSecret } = credentials
            ? LinearAppService.validateCredentials(credentials)
            : await this.getStoredCredentials(user.organizationUuid);
        const state = nanoid();
        const codeVerifier = randomBytes(32).toString('base64url');
        const codeChallenge = createHash('sha256')
            .update(codeVerifier)
            .digest('base64url');
        const redirectUri = this.getRedirectUri();

        this.analytics.track({
            event: 'linear_install.started',
            userId: user.userUuid,
            properties: {
                organizationId: user.organizationUuid,
            },
        });

        return {
            installUrl: getLinearAuthorizationUrl(
                clientId,
                redirectUri,
                state,
                codeChallenge,
            ),
            returnToUrl: this.getSettingsUrl(),
            state,
            linear: {
                clientId,
                encryptedClientSecret: this.encryptionUtil
                    .encrypt(clientSecret)
                    .toString('base64'),
                codeVerifier,
                redirectUri,
            },
        };
    }

    private getSettingsUrl(error: LinearConnectError | null = null) {
        const url = new URL(
            '/generalSettings/ai/general',
            this.lightdashConfig.siteUrl, // pragma: allowlist secret
        );
        if (error) {
            url.searchParams.set(LINEAR_CONNECT_ERROR_PARAM, error);
        }
        return url.href;
    }

    private failInstall(
        user: SessionUser & LightdashUserWithOrg,
        reason: LinearConnectError,
        detail: string,
    ): string {
        this.logger.warn(`Linear install failed (${reason}): ${detail}`);
        this.analytics.track({
            event: 'linear_install.error',
            userId: user.userUuid,
            properties: {
                organizationId: user.organizationUuid,
                error: reason,
            },
        });
        return this.getSettingsUrl(reason);
    }

    async installCallback(
        user: SessionUser,
        oauth: SessionData['oauth'] | undefined,
        params: { code?: string; state?: string; error?: string },
    ): Promise<string> {
        this.canManageOrg(user);

        try {
            if (
                !params.state ||
                params.state !== oauth?.state ||
                !oauth.linear
            ) {
                return this.failInstall(
                    user,
                    LinearConnectError.SESSION_EXPIRED,
                    'OAuth state does not match the session',
                );
            }
            if (params.error) {
                const linearError = params.error.slice(0, 100);
                return this.failInstall(
                    user,
                    linearError === 'access_denied'
                        ? LinearConnectError.CANCELLED
                        : LinearConnectError.UNKNOWN,
                    `Linear returned ${linearError}`,
                );
            }
            if (!params.code) {
                return this.failInstall(
                    user,
                    LinearConnectError.UNKNOWN,
                    'Linear returned no authorization code',
                );
            }

            const {
                clientId,
                encryptedClientSecret,
                codeVerifier,
                redirectUri,
            } = oauth.linear;
            const clientSecret = this.encryptionUtil.decrypt(
                Buffer.from(encryptedClientSecret, 'base64'),
            );
            const { token, refreshToken } = await exchangeLinearCodeForToken(
                params.code,
                { clientId, clientSecret },
                redirectUri,
                codeVerifier,
            );
            const linearOrganization = await getLinearOrganization(token);
            const existingInstallation =
                await this.linearAppInstallationsModel.findInstallation(
                    user.organizationUuid,
                );
            const workspaceChanged =
                existingInstallation?.organizationUrlKey !==
                linearOrganization.urlKey;
            await this.linearAppInstallationsModel.transaction(async (trx) => {
                await this.linearAppInstallationsModel.upsertInstallation(
                    user,
                    {
                        installationId: linearOrganization.id,
                        token,
                        refreshToken,
                        clientId,
                        clientSecret,
                        organizationName: linearOrganization.name,
                        organizationUrlKey: linearOrganization.urlKey,
                    },
                    trx,
                );
                if (workspaceChanged) {
                    await this.onWorkspaceChanged(user.organizationUuid, trx);
                }
            });

            this.analytics.track({
                event: 'linear_install.completed',
                userId: user.userUuid,
                properties: {
                    organizationId: user.organizationUuid,
                },
            });

            return new URL(oauth.returnTo ?? this.getSettingsUrl()).href;
        } catch (error) {
            return this.failInstall(
                user,
                error instanceof LinearTokenRequestError
                    ? error.reason
                    : LinearConnectError.UNKNOWN,
                getErrorMessage(error),
            );
        }
    }

    async getInstallation(user: SessionUser): Promise<LinearInstallation> {
        this.canManageOrg(user);
        return this.linearAppInstallationsModel.getInstallation(
            user.organizationUuid!,
        );
    }

    async deleteAppInstallation(user: SessionUser) {
        this.canManageOrg(user);

        await this.linearAppInstallationsModel.transaction(async (trx) => {
            await this.linearAppInstallationsModel.deleteInstallation(
                user.organizationUuid!,
                trx,
            );
            await this.onInstallationDeleted(user.organizationUuid!, trx);
        });

        this.analytics.track({
            event: 'linear_install.uninstalled',
            userId: user.userUuid,
            properties: {
                organizationId: user.organizationUuid!,
            },
        });
    }

    async getTeams(user: SessionUser): Promise<LinearTeam[]> {
        this.canManageOrg(user);
        return this.withValidToken(user.organizationUuid!, getLinearTeams);
    }

    async getProjects(
        user: SessionUser,
        teamId: string,
    ): Promise<LinearProject[]> {
        this.canManageOrg(user);
        return this.withValidToken(user.organizationUuid!, (token) =>
            getLinearProjects(token, teamId),
        );
    }

    /**
     * Trusted internal caller (scheduler). Creates a Linear issue with the
     * organization's stored installation token.
     */
    async createIssueForOrganization(
        organizationUuid: string,
        input: {
            title: string;
            description: string;
            teamId: string;
            projectId: string | null;
        },
    ): Promise<LinearCreatedIssue> {
        return this.withValidToken(organizationUuid, (token) =>
            createLinearIssue(token, input),
        );
    }

    /**
     * Trusted internal caller (scheduler). Attaches a URL to a Linear issue
     * so both sides can jump to the other without syncing status.
     */
    async linkIssueUrlForOrganization(
        organizationUuid: string,
        input: {
            issueId: string;
            url: string;
            title: string;
        },
    ): Promise<void> {
        return this.withValidToken(organizationUuid, (token) =>
            linkLinearIssueUrl(token, input),
        );
    }

    private async withValidToken<T>(
        organizationUuid: string,
        run: (token: string) => Promise<T>,
    ): Promise<T> {
        const auth =
            await this.linearAppInstallationsModel.getAuth(organizationUuid);

        try {
            return await run(auth.token);
        } catch (error) {
            if (
                !(error instanceof ForbiddenError) ||
                auth.refreshToken === null ||
                auth.clientId === null
            ) {
                throw error;
            }

            const refreshed = await refreshLinearToken(
                auth.refreshToken,
                auth.clientId,
                auth.clientSecret,
            );
            await this.linearAppInstallationsModel.updateAuth(
                organizationUuid,
                refreshed.token,
                refreshed.refreshToken,
            );
            return run(refreshed.token);
        }
    }
}
