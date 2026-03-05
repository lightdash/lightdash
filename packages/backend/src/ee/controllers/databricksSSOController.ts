import {
    ApiErrorPayload,
    ApiSuccessEmpty,
    NotFoundError,
    WarehouseTypes,
} from '@lightdash/common';
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
        const projectUuid =
            typeof req.query.projectUuid === 'string'
                ? req.query.projectUuid
                : undefined;
        const serverHostName =
            typeof req.query.serverHostName === 'string'
                ? req.query.serverHostName
                : undefined;
        if (projectUuid) {
            const credentials = await this.services
                .getProjectService()
                .getProjectCredentialsPreference(req.user!, projectUuid);
            if (credentials?.credentials.type !== WarehouseTypes.DATABRICKS) {
                throw new NotFoundError(
                    'Databricks credentials not found for this project',
                );
            }
        } else if (serverHostName) {
            const hasHostCredential = await this.services
                .getUserService()
                .hasDatabricksOAuthCredentialForHost(req.user!, serverHostName);
            if (!hasHostCredential) {
                throw new NotFoundError(
                    'Databricks credentials not found for this workspace',
                );
            }
        } else {
            // Fallback for non-project scoped checks
            await this.services
                .getUserService()
                .getAccessToken(req.user!, 'databricks');
        }
        return {
            status: 'ok',
            results: undefined,
        };
    }
}
