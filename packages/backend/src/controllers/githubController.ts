import { ApiSuccessEmpty, ForbiddenError, GitRepo } from '@lightdash/common';
import { Octokit as OctokitRest } from '@octokit/rest';
import {
    Delete,
    Get,
    Middlewares,
    OperationId,
    Query,
    Request,
    Route,
    SuccessResponse,
} from '@tsoa/runtime';
import express from 'express';
import { getGithubApp, getOctokitRestForApp } from '../clients/github/Github';
import { lightdashConfig } from '../config/lightdashConfig';
import { githubAppService } from '../services/services';
import { isAuthenticated, unauthorisedInDemo } from './authentication';
import { BaseController } from './baseController';

const githubAppName = 'lightdash-dev';

/** HOW it works
 *
 * First install the app in the org
 * using /api/v1/github/install
 *
 * This will redirect to the github app to the callback page
 * Write down the refresh token (not sure if we need it) and installation_id (currently hardcoded)
 *
 * and then you can use it on /api/v1/github/list
 * or /api/v1/github/create-branch to create a branch and push some code.
 */
@Route('/api/v1/github')
export class GithubInstallController extends BaseController {
    /**
     * Install the Lightdash GitHub App and link to an organization
     *
     * @param redirect The url to redirect to after installation
     * @param req express request
     */
    @Middlewares([isAuthenticated, unauthorisedInDemo])
    @SuccessResponse('302', 'Not found')
    @Get('/install')
    @OperationId('installGithubAppForOrganization')
    async installGithubAppForOrganization(
        @Request() req: express.Request,
    ): Promise<void> {
        const redirectUrl = new URL(
            '/generalSettings/integrations',
            lightdashConfig.siteUrl,
        );
        const state = req.user!.userUuid; // todo: encrypt this?
        req.session.oauth = {};
        req.session.oauth.returnTo = redirectUrl.href;
        req.session.oauth.state = state;
        this.setStatus(302);
        this.setHeader(
            'Location',
            `https://github.com/apps/${githubAppName}/installations/new?state=${state}`,
        );
    }

    /**
     * Callback URL for GitHub App Authorization also used for GitHub App Installation with combined Authorization
     *
     * @param req {express.Request} express request
     * @param code {string} authorization code from GitHub
     * @param state {string} oauth state parameter
     * @param installation_id {string} installation id from GitHub
     * @param setup_action {string} setup action from GitHub
     */
    @Get('/oauth/callback')
    @OperationId('githubOauthCallback')
    async githubOauthCallback(
        @Request() req: express.Request,
        @Query() code?: string,
        @Query() state?: string,
        @Query() installation_id?: string,
        @Query() setup_action?: string,
    ): Promise<void> {
        if (!state || state !== req.session.oauth?.state) {
            this.setStatus(400);
            throw new Error('State does not match');
        }
        if (setup_action === 'review') {
            // User attempted to setup the app, didn't have permission in GitHub and sent a request to the admins
            // We can't do anything at this point
            this.setStatus(200);
        }

        if (!installation_id) {
            this.setStatus(400);
            throw new Error('Installation id not provided');
        }
        if (code) {
            const userToServerToken = await getGithubApp().oauth.createToken({
                code,
            });

            const { token, refreshToken } = userToServerToken.authentication;
            if (refreshToken === undefined)
                throw new ForbiddenError('Invalid authentication token');

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

            await githubAppService.upsertInstallation(
                state,
                installation_id,
                token,
                refreshToken,
            );
            const redirectUrl = new URL(req.session.oauth?.returnTo || '/');
            req.session.oauth = {};
            this.setStatus(302);
            this.setHeader('Location', redirectUrl.href);
        }
    }

    @Middlewares([isAuthenticated, unauthorisedInDemo])
    @Delete('/uninstall')
    @OperationId('uninstallGithubAppForOrganization')
    async uninstallGithubAppForOrganization(
        @Request() req: express.Request,
    ): Promise<ApiSuccessEmpty> {
        await githubAppService.deleteAppInstallation(req.user!);
        // todo: uninstall app with octokit
        this.setStatus(200);
        return {
            status: 'ok',
            results: undefined,
        };
    }

    @Middlewares([isAuthenticated, unauthorisedInDemo])
    @SuccessResponse('200')
    @Get('/repos/list')
    @OperationId('getGithubListRepositories')
    async getGithubListRepositories(@Request() req: express.Request): Promise<{
        status: 'ok';
        results: Array<GitRepo>;
    }> {
        this.setStatus(200);

        // todo: move all to service
        const installationId = await githubAppService.getInstallationId(
            req.user!,
        );

        if (installationId === undefined)
            throw new Error('Invalid Github installation id');
        const appOctokit = getOctokitRestForApp(installationId);

        const { data } =
            await appOctokit.apps.listReposAccessibleToInstallation();

        return {
            status: 'ok',
            results: data.repositories.map((repo) => ({
                name: repo.name,
                ownerLogin: repo.owner.login,
                fullName: repo.full_name,
            })),
        };
    }
}
