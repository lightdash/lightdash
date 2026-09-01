import { subject } from '@casl/ability';
import {
    AuthorizationError,
    ForbiddenError,
    getErrorMessage,
    isUserWithOrg,
    ParameterError,
    SessionUser,
    type LightdashUserWithOrg,
    type LinearCreatedIssue,
    type LinearInstallation,
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
    linkLinearIssueUrl,
    refreshLinearToken,
} from '../../clients/linear/Linear';
import { LightdashConfig } from '../../config/parseConfig'; // pragma: allowlist secret
import { LinearAppInstallationsModel } from '../../models/LinearAppInstallations/LinearAppInstallationsModel';
import { BaseService } from '../BaseService';

type LinearAppServiceArguments = {
    linearAppInstallationsModel: LinearAppInstallationsModel;
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

    private async getClientId(
        organizationUuid: string,
        clientId?: string,
    ): Promise<string> {
        const requestedClientId = clientId?.trim();
        if (clientId !== undefined && !requestedClientId) {
            throw new ParameterError('Linear OAuth client ID is required');
        }
        if (requestedClientId) {
            if (requestedClientId.length > 255) {
                throw new ParameterError('Linear OAuth client ID is invalid');
            }
            return requestedClientId;
        }

        const auth =
            await this.linearAppInstallationsModel.getAuth(organizationUuid);
        if (!auth.clientId) {
            throw new ParameterError('Linear OAuth client ID is required');
        }
        return auth.clientId;
    }

    async installRedirect(user: SessionUser, clientId?: string) {
        this.canManageOrg(user);
        const resolvedClientId = await this.getClientId(
            user.organizationUuid,
            clientId,
        );
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
                resolvedClientId,
                redirectUri,
                state,
                codeChallenge,
            ),
            returnToUrl: new URL(
                '/generalSettings/ai/general',
                this.lightdashConfig.siteUrl, // pragma: allowlist secret
            ).href,
            state,
            linear: {
                clientId: resolvedClientId,
                codeVerifier,
                redirectUri,
            },
        };
    }

    async installCallback(
        user: SessionUser,
        oauth: SessionData['oauth'],
        code?: string,
        state?: string,
    ): Promise<string> {
        this.canManageOrg(user);

        try {
            if (!state || state !== oauth?.state) {
                throw new AuthorizationError('State does not match');
            }
            if (!code) {
                throw new ParameterError('Code not provided');
            }
            if (!oauth.linear) {
                throw new ParameterError('Linear OAuth session not found');
            }

            const { clientId, codeVerifier, redirectUri } = oauth.linear;
            const { token, refreshToken } = await exchangeLinearCodeForToken(
                code,
                clientId,
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
                    organizationId: user.organizationUuid!,
                },
            });

            const returnToUrl = new URL(
                oauth.returnTo ?? this.lightdashConfig.siteUrl, // pragma: allowlist secret
            );
            return returnToUrl.href;
        } catch (error) {
            this.analytics.track({
                event: 'linear_install.error',
                userId: user.userUuid,
                properties: {
                    organizationId: user.organizationUuid!,
                    error: getErrorMessage(error),
                },
            });
            throw error;
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
