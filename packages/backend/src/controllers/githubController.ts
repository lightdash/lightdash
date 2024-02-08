import { ApiSuccessEmpty, GitRepo } from '@lightdash/common';
import { createAppAuth } from '@octokit/auth-app';
import { Octokit as OktokitRest } from '@octokit/rest';
import {
    Controller,
    Get,
    Middlewares,
    OperationId,
    Query,
    Request,
    Route,
    SuccessResponse,
} from '@tsoa/runtime';
import express from 'express';
import { lightdashConfig } from '../config/lightdashConfig';
import { githubAppService } from '../services/services';
import { isAuthenticated, unauthorisedInDemo } from './authentication';

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
 *
 *
 */
@Route('/api/v1/github')
export class GithubInstallController extends Controller {
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
            lightdashConfig.siteUrl,
            '/generalSettings/integrations',
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
        console.log('code', code);
        console.log('state', state);
        console.log('installation_id', installation_id);
        console.log('setup_action', setup_action);

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

        /*   if (code) {
        }if (setup_action === 'install' && installation_id && code) {
            // User successfully installed the app
            console.log('installation_id', installation_id)
            const userToServerToken = await githubApp.oauth.createToken({
                code,
            });
            console.log('userToServerToken', userToServerToken)
            const userOctokit = new Octokit({
                authStrategy: createTokenAuth,
                auth: userToServerToken.authentication.token,
            });
            const response = await userOctokit.request(
                'GET /user/installations',
            );
            const installation = response.data.installations.find(
                (i) => `${i.id}` === installation_id,
            );
            if (installation === undefined) {
                this.setStatus(400);
                throw new Error('Installation not found');
            }

            // store installation id
        }
        if (code && !installation_id) {
            const userToServerToken = await githubApp.oauth.createToken({
                code,
            });
            // store userToServerToken
        } */
        await githubAppService.upsertInstallation(state, installation_id);
        const redirectUrl = new URL(req.session.oauth?.returnTo || '/');
        req.session.oauth = {};
        this.setStatus(302);
        this.setHeader('Location', redirectUrl.href);
    }

    @Middlewares([isAuthenticated, unauthorisedInDemo])
    @Get('/uninstall')
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

        const installationId = await githubAppService.getInstallationId(
            req.user!,
        );

        const appOctokit = new OktokitRest({
            authStrategy: createAppAuth,
            auth: {
                appId: 703670,
                privateKey: process.env.GITHUB_PRIVATE_KEY,
                // optional: this will make appOctokit authenticate as app (JWT)
                //           or installation (access token), depending on the request URL
                installationId,
            },
        });

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
