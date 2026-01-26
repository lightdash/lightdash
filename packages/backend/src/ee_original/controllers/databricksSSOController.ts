import { ApiErrorPayload, ApiSuccessEmpty } from '@lightdash/common';
import {
    Get,
    Middlewares,
    OperationId,
    Request,
    Response,
    Route,
    SuccessResponse,
    Tags,
} from '@tsoa/runtime';
import express from 'express';
import {
    allowApiKeyAuthentication,
    isAuthenticated,
} from '../../controllers/authentication';
import { BaseController } from '../../controllers/baseController';

@Route('/api/v1/databricks/sso')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('Projects')
export class DatabricksSSOController extends BaseController {
    /**
     * Check if user is authenticated with Databricks OAuth
     * @summary Check Databricks OAuth authentication
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/is-authenticated')
    @OperationId('getDatabricksAccessToken')
    async get(@Request() req: express.Request): Promise<ApiSuccessEmpty> {
        this.setStatus(200);
        // This will throw an error if the user is not authenticated with databricks scopes
        await this.services
            .getUserService()
            .getAccessToken(req.user!, 'databricks');
        return {
            status: 'ok',
            results: undefined,
        };
    }
}
