import {
    ApiErrorPayload,
    ApiSuccessEmpty,
    assertRegisteredAccount,
    DatabricksAuthenticationType,
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
import { toSessionUser } from '../../auth/account';
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
        assertRegisteredAccount(req.account);
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
            const authInfo = await this.services
                .getProjectService()
                .getProjectWarehouseAuthInfo(
                    toSessionUser(req.account),
                    projectUuid,
                );
            // M2M auth uses project-level credentials, so no per-user SSO is expected.
            if (
                authInfo.type === WarehouseTypes.DATABRICKS &&
                authInfo.authenticationType ===
                    DatabricksAuthenticationType.OAUTH_M2M
            ) {
                return {
                    status: 'ok',
                    results: undefined,
                };
            }
            const credentials = await this.services
                .getProjectService()
                .getProjectCredentialsPreference(
                    toSessionUser(req.account),
                    projectUuid,
                );
            if (credentials?.credentials.type !== WarehouseTypes.DATABRICKS) {
                throw new NotFoundError(
                    'Databricks credentials not found for this project',
                );
            }
        } else if (serverHostName) {
            const hasHostCredential = await this.services
                .getUserService()
                .hasDatabricksOAuthCredentialForHost(
                    toSessionUser(req.account),
                    serverHostName,
                );
            if (!hasHostCredential) {
                throw new NotFoundError(
                    'Databricks credentials not found for this workspace',
                );
            }
        } else {
            // Fallback for non-project scoped checks
            await this.services
                .getUserService()
                .getAccessToken(toSessionUser(req.account), 'databricks');
        }
        return {
            status: 'ok',
            results: undefined,
        };
    }
}
