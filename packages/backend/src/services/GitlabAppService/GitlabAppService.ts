import { subject } from '@casl/ability';
import {
    AnyType,
    AuthorizationError,
    ForbiddenError,
    getErrorMessage,
    isUserWithOrg,
    MissingConfigError,
    NotFoundError,
    ParameterError,
    SessionUser,
} from '@lightdash/common';
import { SessionData } from 'express-session';
import { nanoid } from 'nanoid';
import { LightdashAnalytics } from '../../analytics/LightdashAnalytics';
import {
    exchangeCodeForToken,
    getGitlabAuthorizationUrl,
    getGitlabProjects,
    getGitlabUser,
    refreshGitlabToken,
} from '../../clients/gitlab/Gitlab';
import { LightdashConfig } from '../../config/parseConfig';
import { GitlabAppInstallationsModel } from '../../models/GitlabAppInstallations/GitlabAppInstallationsModel';
import { UserModel } from '../../models/UserModel';
import { BaseService } from '../BaseService';

type GitlabAppServiceArguments = {
    gitlabAppInstallationsModel: GitlabAppInstallationsModel;
    userModel: UserModel;
    lightdashConfig: LightdashConfig;
    analytics: LightdashAnalytics;
};

export class GitlabAppService extends BaseService {
    private readonly gitlabAppInstallationsModel: GitlabAppInstallationsModel;

    private readonly userModel: UserModel;

    private readonly lightdashConfig: LightdashConfig;

    private readonly analytics: LightdashAnalytics;

    constructor(args: GitlabAppServiceArguments) {
        super();
        this.gitlabAppInstallationsModel = args.gitlabAppInstallationsModel;
        this.userModel = args.userModel;
        this.lightdashConfig = args.lightdashConfig;
        this.analytics = args.analytics;
    }

    async installRedirect(user: SessionUser, gitlabInstanceUrl?: string) {
        this.analytics.track({
            event: 'gitlab_install.started',
            userId: user.userUuid,
            properties: {
                organizationId: user.organizationUuid!,
                gitlabInstanceUrl: gitlabInstanceUrl || 'https://gitlab.com',
            },
        });

        const returnToUrl = new URL(
            '/generalSettings/integrations',
            this.lightdashConfig.siteUrl,
        );
        const randomID = nanoid().replace('_', ''); // we use _ as separator, don't allow this character on the nanoid
        const subdomain =
            this.lightdashConfig.gitlab.redirectDomain || 'default';
        const state = `${subdomain}_${randomID}`;

        const redirectUri = new URL(
            '/api/v1/gitlab/oauth/callback',
            this.lightdashConfig.siteUrl,
        ).href;

        const { clientId } = this.lightdashConfig.gitlab;
        if (!clientId) {
            throw new MissingConfigError('GitLab client ID not configured');
        }

        const installUrl = getGitlabAuthorizationUrl(
            clientId,
            redirectUri,
            state,
            gitlabInstanceUrl,
        );

        return {
            installUrl,
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
        gitlabInstanceUrl?: string,
    ) {
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

            const { clientId, clientSecret } = this.lightdashConfig.gitlab;

            if (!clientId || !clientSecret) {
                throw new MissingConfigError(
                    'GitLab OAuth credentials not configured',
                );
            }

            const redirectUri = new URL(
                '/api/v1/gitlab/oauth/callback',
                this.lightdashConfig.siteUrl,
            ).href;

            const { token, refreshToken } = await exchangeCodeForToken(
                code,
                clientId,
                clientSecret,
                redirectUri,
                gitlabInstanceUrl,
            );

            // Get user info to use as installation ID
            const gitlabUser = await getGitlabUser(token, gitlabInstanceUrl);
            const installationId = gitlabUser.id.toString();

            await this.upsertInstallation(
                userUuid,
                installationId,
                token,
                refreshToken,
                gitlabInstanceUrl || 'https://gitlab.com',
            );

            this.analytics.track({
                event: 'gitlab_install.completed',
                userId: user.userUuid,
                properties: {
                    organizationId: user.organizationUuid!,
                    gitlabInstanceUrl:
                        gitlabInstanceUrl || 'https://gitlab.com',
                },
            });

            const redirectUrl = new URL(oauth?.returnTo || '/');
            return redirectUrl.href;
        } catch (error) {
            this.analytics.track({
                event: 'gitlab_install.error',
                userId: user.userUuid,
                properties: {
                    organizationId: user.organizationUuid!,
                    error: getErrorMessage(error),
                },
            });
            throw error;
        }
    }

    async getInstallationId(user: SessionUser) {
        if (!isUserWithOrg(user)) {
            throw new Error('User is not part of an organization');
        }

        // This endpoint is also used for developers on projects
        // when using the sql runner, so we should allow access
        // However gitlab app is an organization property, so we can't check projects
        if (
            user.ability.cannot(
                'view',
                subject('Organization', {
                    organizationUuid: user.organizationUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }
        return this.gitlabAppInstallationsModel.getInstallationId(
            user.organizationUuid,
        );
    }

    async upsertInstallation(
        userUuid: string,
        installationId: string,
        token: string,
        refreshToken: string,
        gitlabInstanceUrl: string,
    ) {
        const user = await this.userModel.findSessionUserByUUID(userUuid);

        if (!user || !isUserWithOrg(user)) {
            throw new Error('User is not part of an organization');
        }
        if (
            user.ability.cannot(
                'update',
                subject('Organization', {
                    organizationUuid: user.organizationUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }
        const currentInstallationId =
            await this.gitlabAppInstallationsModel.findInstallationId(
                user.organizationUuid,
            );
        if (currentInstallationId) {
            await this.gitlabAppInstallationsModel.updateInstallation(
                user,
                installationId,
            );
        } else {
            await this.gitlabAppInstallationsModel.createInstallation(
                user,
                installationId,
                token,
                refreshToken,
                gitlabInstanceUrl,
            );
        }
    }

    async deleteAppInstallation(user: SessionUser) {
        if (!isUserWithOrg(user)) {
            throw new Error('User is not part of an organization');
        }
        // Permissions are checked on this.getInstallationId
        try {
            const installationId = await this.getInstallationId(user);
            if (installationId) {
                this.analytics.track({
                    event: 'gitlab_install.uninstalled',
                    userId: user.userUuid,
                    properties: {
                        organizationId: user.organizationUuid!,
                    },
                });
            }
        } catch (error) {
            console.error('GitLab api error when uninstalling app', error);
        }

        return this.gitlabAppInstallationsModel.deleteInstallation(
            user.organizationUuid,
        );
    }

    async getProjects(user: SessionUser) {
        // Permissions are checked on this.getInstallationId
        const installationId = await this.getInstallationId(user);

        if (installationId === undefined)
            throw new NotFoundError('Missing GitLab installation');

        try {
            const auth = await this.gitlabAppInstallationsModel.getAuth(
                user.organizationUuid!,
            );

            // Try to refresh token if needed
            const { token } = await this.getOrRefreshToken(
                auth.token,
                auth.refreshToken,
                auth.gitlabInstanceUrl,
                user.organizationUuid!,
            );

            const projects = await getGitlabProjects(
                token,
                auth.gitlabInstanceUrl,
            );
            return projects.map((project: AnyType) => ({
                name: project.name,
                ownerLogin: project.nameWithNamespace.split('/')[0],
                fullName: project.nameWithNamespace,
                id: project.id,
                pathWithNamespace: project.pathWithNamespace,
                webUrl: project.webUrl,
                defaultBranch: project.defaultBranch,
            }));
        } catch (error) {
            console.error('GitLab api error', error);
            throw new MissingConfigError('Invalid GitLab integration config');
        }
    }

    private async getOrRefreshToken(
        token: string,
        refreshToken: string,
        gitlabInstanceUrl: string,
        organizationUuid: string,
    ) {
        // For now, we'll assume the token is valid and refresh when needed
        // In a full implementation, you might want to check token validity first
        try {
            return { token, refreshToken };
        } catch {
            console.debug('Refreshing expired or invalid GitLab token');

            const { clientId, clientSecret } = this.lightdashConfig.gitlab;

            if (!clientId || !clientSecret) {
                throw new MissingConfigError(
                    'GitLab OAuth credentials not configured',
                );
            }

            const newTokens = await refreshGitlabToken(
                refreshToken,
                clientId,
                clientSecret,
                gitlabInstanceUrl,
            );

            // Update stored tokens
            await this.gitlabAppInstallationsModel.updateAuth(
                organizationUuid,
                newTokens.token,
                newTokens.refreshToken,
            );

            return newTokens;
        }
    }
}
