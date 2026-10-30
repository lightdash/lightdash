import {
    assertRegisteredAccount,
    type ApiErrorPayload,
    type ExternalConnection,
    type GoogleLiveSourcePendingChoice,
} from '@lightdash/common';
import {
    Body,
    Get,
    Hidden,
    Middlewares,
    OperationId,
    Path,
    Post,
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
import { ExternalConnectionService } from '../services/ExternalConnectionService/ExternalConnectionService';

@Route('/api/v1/ee/projects/{projectUuid}/live-sources/google/oauth')
@Hidden()
@Response<ApiErrorPayload>('default', 'Error')
export class GoogleLiveSourceOAuthController extends BaseController {
    /**
     * Sends the browser to Google to sign in for a live data source
     * @summary Start Google sign-in for a live source
     */
    @Middlewares([isAuthenticated, unauthorisedInDemo])
    @SuccessResponse('302', 'Redirect to Google')
    @Get('start')
    @OperationId('startGoogleLiveSourceOAuth')
    async startGoogleLiveSourceOAuth(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Query() connector: string,
        @Query() name: string,
        @Query() connectionUuid?: string,
    ): Promise<void> {
        assertRegisteredAccount(req.account);
        const { authorizeUrl, state, session } =
            await this.getService().startGoogleOAuth(req.account, projectUuid, {
                connector,
                name,
                connectionUuid: connectionUuid ?? null,
            });
        req.session.oauth = { state, googleLiveSource: session };
        this.setStatus(302);
        this.setHeader('Location', authorizeUrl);
    }

    /**
     * What the waiting Google sign-in can read, for the admin to pick one
     * @summary Get pending Google sign-in choices
     */
    @Middlewares([isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('pending')
    @OperationId('getPendingGoogleLiveSource')
    async getPendingGoogleLiveSource(
        @Request() req: express.Request,
        @Path() projectUuid: string,
    ): Promise<{ status: 'ok'; results: GoogleLiveSourcePendingChoice }> {
        assertRegisteredAccount(req.account);
        const results = await this.getService().getPendingGoogleChoice(
            req.account,
            projectUuid,
            req.session.pendingGoogleLiveSource,
        );
        this.setStatus(200);
        return { status: 'ok', results };
    }

    /**
     * Saves the waiting Google sign-in as a source reading the picked property
     * @summary Finish Google sign-in
     */
    @Middlewares([isAuthenticated, unauthorisedInDemo])
    @SuccessResponse('200', 'Success')
    @Post('pending')
    @OperationId('finishPendingGoogleLiveSource')
    async finishPendingGoogleLiveSource(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Body() body: { choice: string },
    ): Promise<{ status: 'ok'; results: ExternalConnection }> {
        assertRegisteredAccount(req.account);
        const results = await this.getService().finishGoogleOAuth(
            req.account,
            projectUuid,
            req.session.pendingGoogleLiveSource,
            body.choice,
        );
        req.session.pendingGoogleLiveSource = undefined;
        this.setStatus(200);
        return { status: 'ok', results };
    }

    private getService(): ExternalConnectionService {
        return this.services.getExternalConnectionService<ExternalConnectionService>();
    }
}
