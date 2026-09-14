import {
    assertRegisteredAccount,
    ParameterError,
    type ApiJiraInstallUrlResponse,
    type ApiSuccessEmpty,
    type JiraInstallation,
    type JiraIssueType,
    type JiraOAuthCredentials,
    type JiraProject,
    type JiraSite,
} from '@lightdash/common'; // pragma: allowlist secret
import {
    Body,
    Delete,
    Get,
    Middlewares,
    OperationId,
    Post,
    Put,
    Query,
    Request,
    Route,
    SuccessResponse,
    Tags,
} from '@tsoa/runtime';
import express from 'express';
import { toSessionUser } from '../auth/account';
import { isAuthenticated, unauthorisedInDemo } from './authentication';
import { BaseController } from './baseController';

@Route('/api/v1/jira')
@Tags('Integrations')
export class JiraController extends BaseController {
    /**
     * Start Jira OAuth with the organization's own Atlassian OAuth 2.0 app
     * @summary Connect Jira
     */
    @Middlewares([isAuthenticated, unauthorisedInDemo])
    @SuccessResponse('200')
    @Post('/install')
    @OperationId('installJiraIntegration')
    async installJiraIntegration(
        @Request() req: express.Request,
        @Body() body: JiraOAuthCredentials,
    ): Promise<ApiJiraInstallUrlResponse> {
        assertRegisteredAccount(req.account);
        const context = await this.services
            .getJiraAppService()
            .installRedirect(toSessionUser(req.account), body);
        req.session.oauth = {
            returnTo: context.returnToUrl,
            state: context.state,
            jira: context.jira,
        };
        return {
            status: 'ok',
            results: { installUrl: context.installUrl },
        };
    }

    /**
     * Restart Jira OAuth with the credentials already saved for the organization
     * @summary Reconnect Jira
     */
    @Middlewares([isAuthenticated, unauthorisedInDemo])
    @SuccessResponse('302', 'Redirect to Jira OAuth')
    @Get('/install')
    @OperationId('reconnectJiraIntegration')
    async reconnectJiraIntegration(
        @Request() req: express.Request,
    ): Promise<void> {
        assertRegisteredAccount(req.account);
        const context = await this.services
            .getJiraAppService()
            .installRedirect(toSessionUser(req.account), null);
        req.session.oauth = {
            returnTo: context.returnToUrl,
            state: context.state,
            jira: context.jira,
        };
        this.setStatus(302);
        this.setHeader('Location', context.installUrl);
    }

    /**
     * Finish Jira OAuth and return to Ask AI settings
     * @summary Jira OAuth callback
     */
    @Get('/oauth/callback')
    @OperationId('jiraOauthCallback')
    async jiraOauthCallback(
        @Request() req: express.Request,
        @Query() code?: string,
        @Query() state?: string,
    ): Promise<void> {
        assertRegisteredAccount(req.account);
        if (!state || state !== req.session.oauth?.state) {
            this.setStatus(400);
            throw new ParameterError('State does not match');
        }
        const redirectUrl = await this.services
            .getJiraAppService()
            .installCallback(
                toSessionUser(req.account),
                req.session.oauth,
                code,
                state,
            );
        this.setStatus(302);
        this.setHeader('Location', redirectUrl);
    }

    /**
     * Get the Jira site connected to the organization
     * @summary Get Jira installation
     */
    @Middlewares([isAuthenticated, unauthorisedInDemo])
    @SuccessResponse('200')
    @Get('/')
    @OperationId('getJiraInstallation')
    async getJiraInstallation(@Request() req: express.Request): Promise<{
        status: 'ok';
        results: JiraInstallation;
    }> {
        assertRegisteredAccount(req.account);
        return {
            status: 'ok',
            results: await this.services
                .getJiraAppService()
                .getInstallation(toSessionUser(req.account)),
        };
    }

    /**
     * List Jira sites available through the connection
     * @summary List Jira sites
     */
    @Middlewares([isAuthenticated, unauthorisedInDemo])
    @Get('/sites')
    @OperationId('getJiraSites')
    async getJiraSites(@Request() req: express.Request): Promise<{
        status: 'ok';
        results: JiraSite[];
    }> {
        assertRegisteredAccount(req.account);
        return {
            status: 'ok',
            results: await this.services
                .getJiraAppService()
                .getSites(toSessionUser(req.account)),
        };
    }

    /**
     * Select the Jira site used by the organization
     * @summary Select Jira site
     */
    @Middlewares([isAuthenticated, unauthorisedInDemo])
    @Put('/site')
    @OperationId('selectJiraSite')
    async selectJiraSite(
        @Request() req: express.Request,
        @Body() body: { siteId: string },
    ): Promise<{ status: 'ok'; results: JiraInstallation }> {
        assertRegisteredAccount(req.account);
        return {
            status: 'ok',
            results: await this.services
                .getJiraAppService()
                .selectSite(toSessionUser(req.account), body.siteId),
        };
    }

    /**
     * List Jira projects accessible through the connection
     * @summary List Jira projects
     */
    @Middlewares([isAuthenticated, unauthorisedInDemo])
    @Get('/projects')
    @OperationId('getJiraProjects')
    async getJiraProjects(@Request() req: express.Request): Promise<{
        status: 'ok';
        results: JiraProject[];
    }> {
        assertRegisteredAccount(req.account);
        return {
            status: 'ok',
            results: await this.services
                .getJiraAppService()
                .getProjects(toSessionUser(req.account)),
        };
    }

    /**
     * List Jira issue types available in a project
     * @summary List Jira issue types
     */
    @Middlewares([isAuthenticated, unauthorisedInDemo])
    @Get('/issue-types')
    @OperationId('getJiraIssueTypes')
    async getJiraIssueTypes(
        @Request() req: express.Request,
        @Query() projectId: string,
    ): Promise<{ status: 'ok'; results: JiraIssueType[] }> {
        assertRegisteredAccount(req.account);
        return {
            status: 'ok',
            results: await this.services
                .getJiraAppService()
                .getIssueTypes(toSessionUser(req.account), projectId),
        };
    }

    /**
     * Uninstall Jira integration from the organization
     * @summary Uninstall Jira integration
     */
    @Middlewares([isAuthenticated, unauthorisedInDemo])
    @Delete('/uninstall')
    @OperationId('uninstallJiraIntegration')
    async uninstallJiraIntegration(
        @Request() req: express.Request,
    ): Promise<ApiSuccessEmpty> {
        assertRegisteredAccount(req.account);
        await this.services
            .getJiraAppService()
            .deleteAppInstallation(toSessionUser(req.account));
        return { status: 'ok', results: undefined };
    }
}
