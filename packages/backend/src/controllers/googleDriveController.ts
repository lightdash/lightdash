import {
    ApiErrorPayload,
    ApiGdriveAccessTokenResponse,
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
    Tags,
} from 'tsoa';
import { userService } from '../services/services';
import { allowApiKeyAuthentication, isAuthenticated } from './authentication';

@Route('/api/v1/gdrive')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('Integrations')
export class GoogleDriveController extends Controller {
    /**
     * Get access token for google drive
     * @param req express request
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/get-access-token')
    @OperationId('getAccessToken')
    async get(
        @Request() req: express.Request,
    ): Promise<ApiGdriveAccessTokenResponse> {
        this.setStatus(200);
        return {
            status: 'ok',
            results: await userService.getAccessToken(req.user!),
        };
    }
}
