import { ApiSuccessEmpty, GitRepo } from '@lightdash/common';
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
import { isAuthenticated, unauthorisedInDemo } from './authentication';
import { BaseController } from './baseController';

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
        const context = await this.services
            .getGithubAppService()
            .installRedirect(req.user!);

        req.session.oauth = {};
        req.session.oauth.returnTo = context.returnToUrl;
        req.session.oauth.state = context.state;
        req.session.oauth.inviteCode = context.inviteCode;

        this.setStatus(302);
        this.setHeader('Location', context.installUrl);
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
        const redirectUrl = await this.services
            .getGithubAppService()
            .installCallback(
                req.user!,
                req.session.oauth,
                code,
                state,
                installation_id,
                setup_action,
            );
        this.setStatus(302);
        this.setHeader('Location', redirectUrl);
    }

    @Middlewares([isAuthenticated, unauthorisedInDemo])
    @Delete('/uninstall')
    @OperationId('uninstallGithubAppForOrganization')
    async uninstallGithubAppForOrganization(
        @Request() req: express.Request,
    ): Promise<ApiSuccessEmpty> {
        await this.services
            .getGithubAppService()
            .deleteAppInstallation(req.user!);

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

        return {
            status: 'ok',
            results: await this.services
                .getGithubAppService()
                .getRepos(req.user!),
        };
    }
}
