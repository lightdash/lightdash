import { subject } from '@casl/ability';
import {
    AuthorizationError,
    ForbiddenError,
    isUserWithOrg,
    MissingConfigError,
    NotFoundError,
    ParameterError,
    SessionUser,
} from '@lightdash/common';
import { Octokit as OctokitRest } from '@octokit/rest';
import { SessionData } from 'express-session';
import { nanoid } from 'nanoid';
import { LightdashAnalytics } from '../../analytics/LightdashAnalytics';
import {
    getGithubApp,
    getOctokitRestForApp,
} from '../../clients/github/Github';
import { LightdashConfig } from '../../config/parseConfig';
import { GithubAppInstallationsModel } from '../../models/GithubAppInstallations/GithubAppInstallationsModel';
import { UserModel } from '../../models/UserModel';
import { BaseService } from '../BaseService';

type GithubAppServiceArguments = {
    githubAppInstallationsModel: GithubAppInstallationsModel;
    userModel: UserModel;
    lightdashConfig: LightdashConfig;
    analytics: LightdashAnalytics;
};

export class GithubAppService extends BaseService {
    private readonly githubAppInstallationsModel: GithubAppInstallationsModel;

    private readonly userModel: UserModel;

    private readonly lightdashConfig: LightdashConfig;

    private readonly analytics: LightdashAnalytics;

    constructor(args: GithubAppServiceArguments) {
        super();
        this.githubAppInstallationsModel = args.githubAppInstallationsModel;
        this.userModel = args.userModel;
        this.lightdashConfig = args.lightdashConfig;
        this.analytics = args.analytics;
    }

    async installRedirect(user: SessionUser) {
        this.analytics.track({
            event: 'github_install.started',
            userId: user.userUuid,
            properties: {
                organizationId: user.organizationUuid!,
            },
        });

        const returnToUrl = new URL(
            '/generalSettings/integrations',
            this.lightdashConfig.siteUrl,
        );
        const randomID = nanoid().replace('_', ''); // we use _ as separator, don't allow this character on the nanoid
        const subdomain = this.lightdashConfig.github.redirectDomain;
        const state = `${subdomain}_${randomID}`;
        const githubAppName = this.lightdashConfig.github.appName;

        return {
            installUrl: `https://github.com/apps/${githubAppName}/installations/new?state=${state}`,
            returnToUrl: returnToUrl.href,
            state,
            githubAppName,
            inviteCode: user.userUuid,
        };
    }

    async installCallback(
        user: SessionUser,
        oauth: SessionData['oauth'],
        code?: string,
        state?: string,
        installation_id?: string,
        setup_action?: string,
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
            const userToServerToken = await getGithubApp().oauth.createToken({
                code,
            });

            const { token, refreshToken } = userToServerToken.authentication;
            if (refreshToken === undefined)
                throw new ForbiddenError('Invalid authentication token');

            const redirectUrl = new URL(oauth?.returnTo || '/');

            if (setup_action === 'request') {
                // User attempted to setup the app, didn't have permission in GitHub and sent a request to the admins
                // We will try to poll for the installation id
                console.info(
                    'Waiting for Github app to be authorized by an admin',
                );

                const interval = setInterval(async () => {
                    const response =
                        await new OctokitRest().apps.listInstallationsForAuthenticatedUser(
                            {
                                headers: {
                                    authorization: `Bearer ${token}`,
                                },
                            },
                        );
                    const { installations } = response.data;
                    if (installations.length > 0) {
                        const installationId = installations[0].id.toString();

                        console.info(
                            `Finishing Github authorized installation ${installationId}`,
                        );
                        await this.upsertInstallation(
                            userUuid,
                            installationId,
                            token,
                            refreshToken,
                        );

                        this.analytics.track({
                            event: 'github_install.completed',
                            userId: user.userUuid,
                            properties: {
                                organizationId: user.organizationUuid!,
                                byAdmin: false,
                            },
                        });

                        clearInterval(interval);
                    }
                }, 1000 * 60);

                return `${redirectUrl.href}?status=github_request_sent`;
            }

            if (!installation_id) {
                throw new ParameterError('Installation id not provided');
            }
            // Verify installation
            const response =
                await new OctokitRest().apps.listInstallationsForAuthenticatedUser(
                    {
                        headers: {
                            authorization: `Bearer ${token}`,
                        },
                    },
                );
            const installation = response.data.installations.find(
                (i) => `${i.id}` === installation_id,
            );
            if (installation === undefined)
                throw new Error('Invalid installation id');

            await this.upsertInstallation(
                userUuid,
                installation_id,
                token,
                refreshToken,
            );

            this.analytics.track({
                event: 'github_install.completed',
                userId: user.userUuid,
                properties: {
                    organizationId: user.organizationUuid!,
                    byAdmin: true,
                },
            });

            return redirectUrl.href;
        } catch (error) {
            this.analytics.track({
                event: 'github_install.error',
                userId: user.userUuid,
                properties: {
                    organizationId: user.organizationUuid!,
                    byAdmin: setup_action !== 'request',
                    error: error.message,
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
        // However github app is an organization property, so we can't check projects
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
        return this.githubAppInstallationsModel.getInstallationId(
            user.organizationUuid,
        );
    }

    async upsertInstallation(
        userUuid: string,
        installationId: string,
        token: string,
        refreshToken: string,
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
            await this.githubAppInstallationsModel.findInstallationId(
                user.organizationUuid,
            );
        if (currentInstallationId) {
            await this.githubAppInstallationsModel.updateInstallation(
                user,
                installationId,
            );
        } else {
            await this.githubAppInstallationsModel.createInstallation(
                user,
                installationId,
                token,
                refreshToken,
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
            const appOctokit = getOctokitRestForApp(installationId!);
            await appOctokit.apps.deleteInstallation({
                installation_id: parseInt(installationId!, 10),
            });
        } catch (error) {
            console.error('Github api error when uninstalling app', error);
        }

        return this.githubAppInstallationsModel.deleteInstallation(
            user.organizationUuid,
        );
    }

    async getRepos(user: SessionUser) {
        // Permissions are checked on this.getInstallationId
        const installationId = await this.getInstallationId(user);

        if (installationId === undefined)
            throw new NotFoundError('Missing Github installation');
        const appOctokit = getOctokitRestForApp(installationId);

        try {
            const { data } =
                await appOctokit.apps.listReposAccessibleToInstallation();
            return data.repositories.map((repo) => ({
                name: repo.name,
                ownerLogin: repo.owner.login,
                fullName: repo.full_name,
            }));
        } catch (error) {
            console.error('Github api error', error);
            throw new MissingConfigError('Invalid Github integration config');
        }
    }
}
