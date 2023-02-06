import { ApiErrorPayload, ApiSlackChannelsResponse } from '@lightdash/common';
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
        return {
            status: 'ok',
            results: [
                {
                    id: '1',
                    label: 'Jose',
                },
                {
                    id: '2',
                    label: 'Javi',
                },
                {
                    id: '3',
                    label: 'Banana',
                },
                {
                    id: '4',
                    label: 'Test white spaces',
                },
            ],
        };
    }
}
