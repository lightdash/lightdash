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
export class LinkedInAdsOAuthController extends BaseController {
    /**
     * Sends the browser to LinkedIn to sign in
     * @summary Start LinkedIn sign-in
     */
    @Middlewares([isAuthenticated, unauthorisedInDemo])
    @SuccessResponse('302', 'Redirect to LinkedIn')
    @Get('projects/{projectUuid}/live-sources/linkedin/oauth/start')
    @OperationId('startLinkedInAdsOAuth')
    async startLinkedInAdsOAuth(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Query() name: string,
        @Query() adAccountId: string,
        @Query() connectionUuid?: string,
        @Query() returnTo?: string,
    ): Promise<void> {
        assertRegisteredAccount(req.account);
        const { authorizeUrl, state, session } =
            await this.getService().startLinkedInAdsOAuth(
                req.account,
                projectUuid,
                {
                    name,
                    adAccountId,
                    connectionUuid: connectionUuid ?? null,
                },
            );
        req.session.oauth = {
            state,
            linkedInAds: session,
            liveSourceReturnTo: parseLiveSourceReturnTo(returnTo),
        };
        this.setStatus(302);
        this.setHeader('Location', authorizeUrl);
    }

    /**
     * Finishes LinkedIn sign-in and returns to the Live data sources page
     * @summary LinkedIn sign-in callback
     */
    @Middlewares([isAuthenticated])
    @SuccessResponse('302', 'Redirect to Live data sources')
    @Get('linkedin/oauth/callback')
    @OperationId('linkedInAdsOAuthCallback')
    async linkedInAdsOAuthCallback(
        @Request() req: express.Request,
        @Query() code?: string,
        @Query() state?: string,
        @Query() error?: string,
    ): Promise<void> {
        assertRegisteredAccount(req.account);
        const session = req.session.oauth?.linkedInAds;
        const liveSourceReturnTo = req.session.oauth?.liveSourceReturnTo;
        if (!session || !state || state !== req.session.oauth?.state) {
            throw new ParameterError('LinkedIn sign-in state does not match');
        }
        req.session.oauth = {};

        const service = this.getService();
        let result: { connectionUuid: string } | { error: string };
        if (error || !code) {
            result = { error: 'LinkedIn sign-in was cancelled' };
        } else {
            try {
                const connection = await service.completeLinkedInAdsOAuth(
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
