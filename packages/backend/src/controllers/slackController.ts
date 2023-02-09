import {
    ApiErrorPayload,
    ApiSlackChannelsResponse,
    ForbiddenError,
} from '@lightdash/common';
import express from 'express';
import {
    Controller,
    Get,
    Middlewares,
    OperationId,
    Request,
    Response,
    Route,
    SuccessResponse,
} from 'tsoa';
import { slackClient } from '../clients/clients';
import { allowApiKeyAuthentication, isAuthenticated } from './authentication';

@Route('/api/v1/slack')
@Response<ApiErrorPayload>('default', 'Error')
export class SlackController extends Controller {
    /**
     * Get slack channels
     * @param req express request
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/channels')
    @OperationId('getSlackChannels')
    async get(
        @Request() req: express.Request,
    ): Promise<ApiSlackChannelsResponse> {
        this.setStatus(200);
        const organizationUuid = req.user?.organizationUuid;
        if (!organizationUuid) throw new ForbiddenError();
        return {
            status: 'ok',
            results: await slackClient.getChannels(organizationUuid),
        };
    }
}
