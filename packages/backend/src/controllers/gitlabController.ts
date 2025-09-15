import { ApiSuccessEmpty, GitRepo, ParameterError } from '@lightdash/common';
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

/** GitLab OAuth Integration Controller
 *
 * Similar to GitHub integration but uses GitLab OAuth 2.0 flow
 *
 * Flow:
 * 1. /install - Redirects to GitLab OAuth authorization
 * 2. /oauth/callback - Handles OAuth callback and stores tokens
 * 3. /repos/list - Lists accessible GitLab projects
 * 4. /config - Gets current GitLab integration status
 * 5. /uninstall - Removes GitLab integration
 */
@Route('/api/v1/gitlab')
export class GitlabController extends BaseController {
    /**
     * Initiate GitLab OAuth integration
     *
     * @param req express request
     * @param gitlab_instance_url Custom GitLab instance URL (optional, defaults to gitlab.com)
     */
    @Middlewares([isAuthenticated, unauthorisedInDemo])
    @SuccessResponse('302', 'Redirect to GitLab OAuth')
    @Get('/install')
    @OperationId('installGitlabIntegration')
    async installGitlabIntegration(
        @Request() req: express.Request,
        @Query() gitlab_instance_url?: string,
    ): Promise<void> {
        const context = await this.services
            .getGitlabAppService()
            .installRedirect(
                req.user!,
                gitlab_instance_url || 'https://gitlab.com',
            );

        req.session.oauth = {};
        req.session.oauth.returnTo = context.returnToUrl;
        req.session.oauth.state = context.state;
        req.session.oauth.inviteCode = context.inviteCode;

        this.setStatus(302);
        this.setHeader('Location', context.installUrl);
    }

    /**
     * GitLab OAuth callback handler
     *
     * @param req express request
     * @param code Authorization code from GitLab
     * @param state OAuth state parameter for CSRF protection
     * @param gitlab_instance_url GitLab instance URL (for self-hosted instances)
     */
    @Get('/oauth/callback')
    @OperationId('gitlabOauthCallback')
    async gitlabOauthCallback(
        @Request() req: express.Request,
        @Query() code?: string,
        @Query() state?: string,
        @Query() gitlab_instance_url?: string,
    ): Promise<void> {
        if (!state || state !== req.session.oauth?.state) {
            this.setStatus(400);
            throw new ParameterError('State does not match');
        }

        const redirectUrl = await this.services
            .getGitlabAppService()
            .installCallback(
                req.user!,
                req.session.oauth,
                code,
                state,
                gitlab_instance_url,
            );

        this.setStatus(302);
        this.setHeader('Location', redirectUrl);
    }

    @Middlewares([isAuthenticated, unauthorisedInDemo])
    @Delete('/uninstall')
    @OperationId('uninstallGitlabIntegration')
    async uninstallGitlabIntegration(
        @Request() req: express.Request,
    ): Promise<ApiSuccessEmpty> {
        await this.services
            .getGitlabAppService()
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
    @OperationId('getGitlabProjects')
    async getGitlabProjects(@Request() req: express.Request): Promise<{
        status: 'ok';
        results: Array<GitRepo>;
    }> {
        this.setStatus(200);

        return {
            status: 'ok',
            results: await this.services
                .getGitlabAppService()
                .getProjects(req.user!),
        };
    }
}
