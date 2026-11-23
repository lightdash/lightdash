import {
    assertRegisteredAccount,
    getErrorMessage,
    ParameterError,
    type ApiErrorPayload,
    type ApiLiveSourceUserSignInsResponse,
    type ApiSuccessEmpty,
} from '@lightdash/common';
import {
    Delete,
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
    Tags,
} from '@tsoa/runtime';
import express from 'express';
import {
    isAuthenticated,
    unauthorisedInDemo,
} from '../../controllers/authentication';
import { BaseController } from '../../controllers/baseController';
import Logger from '../../logging/logger';
import { ExternalConnectionService } from '../services/ExternalConnectionService/ExternalConnectionService';
import {
    parseLiveSourceReturnPath,
    type LiveSourceUserSignInSession,
} from '../services/ExternalConnectionService/liveSourceUserSignIn';

/** Sign-ins a session waits on at once; the oldest are dropped past it. */
const MAX_PENDING_SIGN_INS = 5;

const keepLatestSignIns = (
    pending: Record<string, LiveSourceUserSignInSession>,
): Record<string, LiveSourceUserSignInSession> =>
    Object.fromEntries(Object.entries(pending).slice(-MAX_PENDING_SIGN_INS));

/**
 * Each viewer's own sign-in to live data sources that query with it, so the
 * integration shows every viewer only what their own account can see.
 */
@Route('/api/v1/ee')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('Live data sources')
export class LiveSourceUserSignInController extends BaseController {
    /**
     * The project's live data sources that query with each viewer's own
     * sign-in, and whether you have signed in to each
     * @summary List your live data source sign-ins
     */
    @Middlewares([isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('projects/{projectUuid}/live-sources/user-sign-ins')
    @OperationId('listLiveSourceUserSignIns')
    async listLiveSourceUserSignIns(
        @Request() req: express.Request,
        @Path() projectUuid: string,
    ): Promise<ApiLiveSourceUserSignInsResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.getService().listUserSignIns(
                req.account,
                projectUuid,
            ),
        };
    }

    /**
     * Sends the browser to the integration to sign in with your own account
     * @summary Start your live data source sign-in
     */
    @Hidden()
    @Middlewares([isAuthenticated, unauthorisedInDemo])
    @SuccessResponse('302', 'Redirect to the integration')
    @Get(
        'projects/{projectUuid}/live-sources/{connectionUuid}/user-sign-in/start',
    )
    @OperationId('startLiveSourceUserSignIn')
    async startLiveSourceUserSignIn(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Path() connectionUuid: string,
        @Query() returnTo?: string,
    ): Promise<void> {
        assertRegisteredAccount(req.account);
        const { authorizeUrl, state, session } =
            await this.getService().startUserSignIn(
                req.account,
                projectUuid,
                connectionUuid,
                parseLiveSourceReturnPath(returnTo, `/projects/${projectUuid}`),
            );
        req.session.liveSourceUserSignIns = keepLatestSignIns({
            ...req.session.liveSourceUserSignIns,
            [state]: session,
        });
        this.setStatus(302);
        this.setHeader('Location', authorizeUrl);
    }

    /**
     * Finishes your sign-in and returns to the page that asked for it
     * @summary Live data source sign-in callback
     */
    @Hidden()
    @Middlewares([isAuthenticated])
    @SuccessResponse('302', 'Redirect back to the app')
    @Get('live-sources/user-sign-in/callback')
    @OperationId('liveSourceUserSignInCallback')
    async liveSourceUserSignInCallback(
        @Request() req: express.Request,
        @Query() code?: string,
        @Query() state?: string,
        @Query() error?: string,
    ): Promise<void> {
        assertRegisteredAccount(req.account);
        const pending = req.session.liveSourceUserSignIns ?? {};
        const session =
            state && Object.hasOwn(pending, state) ? pending[state] : undefined;
        if (!state || !session) {
            // Already used, expired with the session, or never started here
            this.setStatus(302);
            this.setHeader(
                'Location',
                this.getService().getUserSignInReturnUrl('/', {
                    error: 'failed',
                }),
            );
            return;
        }
        // Each sign-in is answered once
        req.session.liveSourceUserSignIns = Object.fromEntries(
            Object.entries(pending).filter(([key]) => key !== state),
        );

        const service = this.getService();
        let result: { connectionUuid: string } | { error: string };
        if (error || !code) {
            // A fixed code, never message text, travels in the address
            result = { error: 'cancelled' };
        } else {
            try {
                await service.completeUserSignIn(req.account, session, code);
                result = { connectionUuid: session.connectionUuid };
            } catch (e) {
                Logger.warn(
                    `Live data source sign-in to ${session.connectionUuid} failed: ${getErrorMessage(e)}`,
                );
                result = { error: 'failed' };
            }
        }
        this.setStatus(302);
        this.setHeader(
            'Location',
            service.getUserSignInReturnUrl(session.returnPath, result),
        );
    }

    /**
     * Forgets your own sign-in to a live data source
     * @summary Disconnect your live data source sign-in
     */
    @Middlewares([isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Delete('projects/{projectUuid}/live-sources/{connectionUuid}/user-sign-in')
    @OperationId('deleteLiveSourceUserSignIn')
    async deleteLiveSourceUserSignIn(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Path() connectionUuid: string,
    ): Promise<ApiSuccessEmpty> {
        assertRegisteredAccount(req.account);
        await this.getService().deleteUserSignIn(
            req.account,
            projectUuid,
            connectionUuid,
        );
        this.setStatus(200);
        return { status: 'ok', results: undefined };
    }

    /**
     * Hydra's consent screen, answered by this server for the signed-in
     * person: approves, or declines as the source's settings say
     * @summary Hydra sign-in
     */
    @Hidden()
    @Middlewares([isAuthenticated])
    @SuccessResponse('302', 'Redirect to the sign-in callback')
    @Get('live-sources/hydra/oauth/authorize')
    @OperationId('authorizeHydraUserSignIn')
    async authorizeHydraUserSignIn(
        @Request() req: express.Request,
        @Query('response_type') responseType?: string,
        @Query('client_id') clientId?: string,
        @Query() resource?: string,
        @Query('redirect_uri') redirectUri?: string,
        @Query() state?: string,
        @Query('code_challenge') codeChallenge?: string,
        @Query('code_challenge_method') codeChallengeMethod?: string,
    ): Promise<void> {
        assertRegisteredAccount(req.account);
        const location = await this.getService().authorizeHydraUserSignIn(
            req.account,
            {
                responseType,
                clientId,
                resource,
                redirectUri,
                state,
                codeChallenge,
                codeChallengeMethod,
            },
        );
        this.setStatus(302);
        this.setHeader('Location', location);
    }

    private getService(): ExternalConnectionService {
        return this.services.getExternalConnectionService<ExternalConnectionService>();
    }
}
