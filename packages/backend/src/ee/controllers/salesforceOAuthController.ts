import {
    assertRegisteredAccount,
    getErrorMessage,
    ParameterError,
    type ApiErrorPayload,
} from '@lightdash/common';
import {
    Get,
    Hidden,
    Middlewares,
    OperationId,
    Path,
    Query,
    Request,
    Response,
    Route,
    SuccessResponse,
} from '@tsoa/runtime';
import express from 'express';
import {
    isAuthenticated,
    unauthorisedInDemo,
} from '../../controllers/authentication';
import { BaseController } from '../../controllers/baseController';
import {
    ExternalConnectionService,
    parseLiveSourceReturnTo,
} from '../services/ExternalConnectionService/ExternalConnectionService';

@Route('/api/v1/ee')
@Hidden()
@Response<ApiErrorPayload>('default', 'Error')
export class SalesforceOAuthController extends BaseController {
    /**
     * Sends the browser to Salesforce to sign in
     * @summary Start Salesforce sign-in
     */
    @Middlewares([isAuthenticated, unauthorisedInDemo])
    @SuccessResponse('302', 'Redirect to Salesforce')
    @Get('projects/{projectUuid}/live-sources/salesforce/oauth/start')
    @OperationId('startSalesforceOAuth')
    async startSalesforceOAuth(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Query() name: string,
        @Query() object: string,
        @Query() connectionUuid?: string,
        @Query() returnTo?: string,
    ): Promise<void> {
        assertRegisteredAccount(req.account);
        const { authorizeUrl, state, session } =
            await this.getService().startSalesforceOAuth(
                req.account,
                projectUuid,
                {
                    name,
                    object,
                    connectionUuid: connectionUuid ?? null,
                },
            );
        req.session.oauth = {
            state,
            salesforce: session,
            liveSourceReturnTo: parseLiveSourceReturnTo(returnTo),
        };
        this.setStatus(302);
        this.setHeader('Location', authorizeUrl);
    }

    /**
     * Finishes Salesforce sign-in and returns to the Live data sources page
     * @summary Salesforce sign-in callback
     */
    @Middlewares([isAuthenticated])
    @SuccessResponse('302', 'Redirect to Live data sources')
    @Get('salesforce/oauth/callback')
    @OperationId('salesforceOAuthCallback')
    async salesforceOAuthCallback(
        @Request() req: express.Request,
        @Query() code?: string,
        @Query() state?: string,
        @Query() error?: string,
    ): Promise<void> {
        assertRegisteredAccount(req.account);
        const session = req.session.oauth?.salesforce;
        const liveSourceReturnTo = req.session.oauth?.liveSourceReturnTo;
        if (!session || !state || state !== req.session.oauth?.state) {
            throw new ParameterError('Salesforce sign-in state does not match');
        }
        req.session.oauth = {};

        const service = this.getService();
        let result: { connectionUuid: string } | { error: string };
        if (error || !code) {
            result = { error: 'Salesforce sign-in was cancelled' };
        } else {
            try {
                const connection = await service.completeSalesforceOAuth(
                    req.account,
                    session,
                    code,
                );
                result = { connectionUuid: connection.externalConnectionUuid };
            } catch (e) {
                result = { error: getErrorMessage(e) };
            }
        }
        this.setStatus(302);
        this.setHeader(
            'Location',
            service.getLiveDataSourcesUrl(
                session.projectUuid,
                result,
                liveSourceReturnTo,
            ),
        );
    }

    private getService(): ExternalConnectionService {
        return this.services.getExternalConnectionService<ExternalConnectionService>();
    }
}
