import {
    assertRegisteredAccount,
    getErrorMessage,
    NotFoundError,
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
import { ExternalConnectionService } from '../services/ExternalConnectionService/ExternalConnectionService';

@Route('/api/v1/ee')
@Hidden()
@Response<ApiErrorPayload>('default', 'Error')
export class PostHogOAuthController extends BaseController {
    /**
     * Sends the browser to PostHog to sign in and pick a project
     * @summary Start PostHog sign-in
     */
    @Middlewares([isAuthenticated, unauthorisedInDemo])
    @SuccessResponse('302', 'Redirect to PostHog')
    @Get('projects/{projectUuid}/live-sources/posthog/oauth/start')
    @OperationId('startPostHogOAuth')
    async startPostHogOAuth(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Query() region: string,
        @Query() name: string,
        @Query() connectionUuid?: string,
    ): Promise<void> {
        assertRegisteredAccount(req.account);
        const { authorizeUrl, state, session } =
            await this.getService().startPostHogOAuth(
                req.account,
                projectUuid,
                {
                    region,
                    name,
                    connectionUuid: connectionUuid ?? null,
                },
            );
        req.session.oauth = { state, postHog: session };
        this.setStatus(302);
        this.setHeader('Location', authorizeUrl);
    }

    /**
     * Finishes PostHog sign-in and returns to the Live data sources page
     * @summary PostHog sign-in callback
     */
    @Middlewares([isAuthenticated])
    @SuccessResponse('302', 'Redirect to Live data sources')
    @Get('posthog/oauth/callback')
    @OperationId('postHogOAuthCallback')
    async postHogOAuthCallback(
        @Request() req: express.Request,
        @Query() code?: string,
        @Query() state?: string,
        @Query() error?: string,
    ): Promise<void> {
        assertRegisteredAccount(req.account);
        const session = req.session.oauth?.postHog;
        if (!session || !state || state !== req.session.oauth?.state) {
            throw new ParameterError('PostHog sign-in state does not match');
        }
        req.session.oauth = {};

        const service = this.getService();
        let result: { connectionUuid: string } | { error: string };
        if (error || !code) {
            result = { error: 'PostHog sign-in was cancelled' };
        } else {
            try {
                const connection = await service.completePostHogOAuth(
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
            service.getLiveDataSourcesUrl(session.projectUuid, result),
        );
    }

    /**
     * The OAuth client metadata document PostHog reads when
     * POSTHOG_OAUTH_CLIENT_ID points at it
     * @summary PostHog OAuth client metadata
     */
    @SuccessResponse('200', 'Success')
    @Get('posthog/oauth/client-metadata.json')
    @OperationId('getPostHogOAuthClientMetadata')
    async getPostHogOAuthClientMetadata(): Promise<Record<string, unknown>> {
        const metadata = this.getService().getPostHogClientMetadata();
        if (!metadata) {
            throw new NotFoundError('PostHog sign-in is not configured');
        }
        this.setStatus(200);
        return metadata;
    }

    private getService(): ExternalConnectionService {
        return this.services.getExternalConnectionService<ExternalConnectionService>();
    }
}
