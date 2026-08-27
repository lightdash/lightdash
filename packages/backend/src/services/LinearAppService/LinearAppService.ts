import { subject } from '@casl/ability';
import {
    AuthorizationError,
    ForbiddenError,
    getErrorMessage,
    isUserWithOrg,
    MissingConfigError,
    ParameterError,
    SessionUser,
    type LinearCreatedIssue,
    type LinearInstallation,
    type LinearProject,
    type LinearTeam,
} from '@lightdash/common'; // pragma: allowlist secret
import { SessionData } from 'express-session';
import { nanoid } from 'nanoid';
import { LightdashAnalytics } from '../../analytics/LightdashAnalytics'; // pragma: allowlist secret
import {
    createLinearIssue,
    exchangeLinearCodeForToken,
    getLinearAuthorizationUrl,
    getLinearOrganization,
    getLinearProjects,
    getLinearTeams,
    refreshLinearToken,
} from '../../clients/linear/Linear';
import { LightdashConfig } from '../../config/parseConfig'; // pragma: allowlist secret
import { LinearAppInstallationsModel } from '../../models/LinearAppInstallations/LinearAppInstallationsModel';
import { UserModel } from '../../models/UserModel';
import { BaseService } from '../BaseService';

type LinearAppServiceArguments = {
    linearAppInstallationsModel: LinearAppInstallationsModel;
    userModel: UserModel;
    lightdashConfig: LightdashConfig; // pragma: allowlist secret
    analytics: LightdashAnalytics; // pragma: allowlist secret
};

export class LinearAppService extends BaseService {
    private readonly linearAppInstallationsModel: LinearAppInstallationsModel;

    private readonly userModel: UserModel;

    private readonly lightdashConfig: LightdashConfig; // pragma: allowlist secret

    private readonly analytics: LightdashAnalytics; // pragma: allowlist secret

    constructor(args: LinearAppServiceArguments) {
        super();
        this.linearAppInstallationsModel = args.linearAppInstallationsModel;
        this.userModel = args.userModel;
        this.lightdashConfig = args.lightdashConfig; // pragma: allowlist secret
        this.analytics = args.analytics;
    }

    private canManageOrg(user: SessionUser) {
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

    private getOAuthCredentials() {
        const { clientId, clientSecret } = this.lightdashConfig.linear; // pragma: allowlist secret
        if (!clientId || !clientSecret) {
            throw new MissingConfigError(
                'Linear OAuth credentials not configured',
            );
        }
        return { clientId, clientSecret };
    }

    private getRedirectUri() {
        return new URL(
            '/api/v1/linear/oauth/callback',
            this.lightdashConfig.siteUrl, // pragma: allowlist secret
        ).href;
    }

    async installRedirect(user: SessionUser) {
        this.canManageOrg(user);

        this.analytics.track({
            event: 'linear_install.started',
            userId: user.userUuid,
            properties: {
                organizationId: user.organizationUuid!,
            },
        });

        const returnToUrl = new URL(
            '/generalSettings/integrations',
            this.lightdashConfig.siteUrl, // pragma: allowlist secret
        );
        const randomID = nanoid().replace('_', '');
        const subdomain =
            this.lightdashConfig.linear.redirectDomain || 'default'; // pragma: allowlist secret
        const state = `${subdomain}_${randomID}`;
        const { clientId } = this.getOAuthCredentials();

        return {
            installUrl: getLinearAuthorizationUrl(
                clientId,
                this.getRedirectUri(),
                state,
            ),
            returnToUrl: returnToUrl.href,
            state,
            inviteCode: user.userUuid,
        };
    }

    async installCallback(
        user: SessionUser,
        oauth: SessionData['oauth'],
        code?: string,
        state?: string,
    ) {
        this.canManageOrg(user);

        try {
            if (!state || state !== oauth?.state) {
                throw new AuthorizationError('State does not match');
            }

            const userUuid = oauth.inviteCode;
            if (!userUuid) {
                throw new ParameterError('User uuid not provided');
            }
            if (!code) {
                throw new ParameterError('Code not provided');
            }

            const { clientId, clientSecret } = this.getOAuthCredentials();
            const { token, refreshToken } = await exchangeLinearCodeForToken(
                code,
                clientId,
                clientSecret,
                this.getRedirectUri(),
            );
            const linearOrganization = await getLinearOrganization(token);
            const installer =
                await this.userModel.findSessionUserByUUID(userUuid);
            if (!installer || !isUserWithOrg(installer)) {
                throw new Error('User is not part of an organization');
            }
            this.canManageOrg(installer);

            const existing =
                await this.linearAppInstallationsModel.findInstallation(
                    installer.organizationUuid,
                );
            const installationArgs = {
                installationId: linearOrganization.id,
                token,
                refreshToken,
                organizationName: linearOrganization.name,
                organizationUrlKey: linearOrganization.urlKey,
            };
            if (existing) {
                await this.linearAppInstallationsModel.updateInstallation(
                    installer,
                    installationArgs,
                );
            } else {
                await this.linearAppInstallationsModel.createInstallation(
                    installer,
                    installationArgs,
                );
            }

            this.analytics.track({
                event: 'linear_install.completed',
                userId: user.userUuid,
                properties: {
                    organizationId: user.organizationUuid!,
                },
            });

            return new URL(oauth?.returnTo || '/').href;
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

        await this.linearAppInstallationsModel.deleteInstallation(
            user.organizationUuid!,
        );

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
     * Linear access tokens are long lived, so spend the stored one directly and
     * refresh only once Linear rejects it. Probing the token before every call
     * would double the request count against a rate-limited API.
     */
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
                auth.refreshToken === null
            ) {
                throw error;
            }

            const { clientId, clientSecret } = this.getOAuthCredentials();
            const refreshed = await refreshLinearToken(
                auth.refreshToken,
                clientId,
                clientSecret,
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
