import {
    ApiSuccessEmpty,
    assertRegisteredAccount,
    ParameterError,
    type LinearInstallation,
    type LinearProject,
    type LinearTeam,
} from '@lightdash/common'; // pragma: allowlist secret
import {
    Delete,
    Get,
    Middlewares,
    OperationId,
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

@Route('/api/v1/linear')
@Tags('Integrations')
export class LinearController extends BaseController {
    /**
     * Start Linear OAuth with PKCE
     * @summary Connect Linear
     */
    @Middlewares([isAuthenticated, unauthorisedInDemo])
    @SuccessResponse('302', 'Redirect to Linear OAuth')
    @Get('/install')
    @OperationId('installLinearIntegration')
    async installLinearIntegration(
        @Request() req: express.Request,
        @Query() clientId?: string,
    ): Promise<void> {
        assertRegisteredAccount(req.account);
        const context = await this.services
            .getLinearAppService()
            .installRedirect(toSessionUser(req.account), clientId);

        req.session.oauth = {
            returnTo: context.returnToUrl,
            state: context.state,
            linear: context.linear,
        };

        this.setStatus(302);
        this.setHeader('Location', context.installUrl);
    }

    /**
     * Finish Linear OAuth and return to Ask AI settings
     * @summary Linear OAuth callback
     */
    @Get('/oauth/callback')
    @OperationId('linearOauthCallback')
    async linearOauthCallback(
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
            .getLinearAppService()
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
     * Get the current Linear workspace connected to the organization
     * @summary Get Linear installation
     */
    @Middlewares([isAuthenticated, unauthorisedInDemo])
    @SuccessResponse('200')
    @Get('/')
    @OperationId('getLinearInstallation')
    async getLinearInstallation(@Request() req: express.Request): Promise<{
        status: 'ok';
        results: LinearInstallation;
    }> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);

        return {
            status: 'ok',
            results: await this.services
                .getLinearAppService()
                .getInstallation(toSessionUser(req.account)),
        };
    }

    /**
     * Uninstall Linear integration from the organization
     * @summary Uninstall Linear integration
     */
    @Middlewares([isAuthenticated, unauthorisedInDemo])
    @Delete('/uninstall')
    @OperationId('uninstallLinearIntegration')
    async uninstallLinearIntegration(
        @Request() req: express.Request,
    ): Promise<ApiSuccessEmpty> {
        assertRegisteredAccount(req.account);
        await this.services
            .getLinearAppService()
            .deleteAppInstallation(toSessionUser(req.account));

        this.setStatus(200);
        return {
            status: 'ok',
            results: undefined,
        };
    }

    /**
     * List Linear teams accessible via the integration
     * @summary List Linear teams
     */
    @Middlewares([isAuthenticated, unauthorisedInDemo])
    @SuccessResponse('200')
    @Get('/teams')
    @OperationId('getLinearTeams')
    async getLinearTeams(@Request() req: express.Request): Promise<{
        status: 'ok';
        results: Array<LinearTeam>;
    }> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);

        return {
            status: 'ok',
            results: await this.services
                .getLinearAppService()
                .getTeams(toSessionUser(req.account)),
        };
    }

    /**
     * List the Linear projects belonging to a team
     * @summary List Linear projects
     */
    @Middlewares([isAuthenticated, unauthorisedInDemo])
    @SuccessResponse('200')
    @Get('/projects')
    @OperationId('getLinearProjects')
    async getLinearProjects(
        @Request() req: express.Request,
        @Query() teamId: string,
    ): Promise<{
        status: 'ok';
        results: Array<LinearProject>;
    }> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);

        return {
            status: 'ok',
            results: await this.services
                .getLinearAppService()
                .getProjects(toSessionUser(req.account), teamId),
        };
    }
}
