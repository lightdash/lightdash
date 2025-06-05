import { ApiErrorPayload, ApiSuccessEmpty } from '@lightdash/common';
import {
    Get,
    Middlewares,
    OperationId,
    Query,
    Request,
    Response,
    Route,
    SuccessResponse,
    Tags,
} from '@tsoa/runtime';
import express from 'express';
import { allowApiKeyAuthentication, isAuthenticated } from './authentication';
import { BaseController } from './baseController';

@Route('/api/v1/snowflake')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('Projects')
export class SnowflakeController extends BaseController {
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/sso/is-authenticated')
    @OperationId('ssoIsAuthenticated')
    async ssoIsAuthenticated(
        @Request() req: express.Request,
    ): Promise<ApiSuccessEmpty> {
        this.setStatus(200);
        // This will throw an error if the user is not authenticated with snowflake scopes
        const accessToken = await this.services
            .getUserService()
            .getAccessToken(req.user!, 'snowflake');
        return {
            status: 'ok',
            results: undefined,
        };
    }
}
