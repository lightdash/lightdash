import {
    assertRegisteredAccount,
    type ApiErrorPayload,
    type ApiWarehouseConnectionsForUserCredentialsResponse,
    type UUID,
} from '@lightdash/common';
import {
    Get,
    Hidden,
    Middlewares,
    OperationId,
    Path,
    Request,
    Response,
    Route,
    SuccessResponse,
    Tags,
} from '@tsoa/runtime';
import express from 'express';
import { allowApiKeyAuthentication, isAuthenticated } from './authentication';
import { BaseController } from './baseController';

@Route('/api/v1/projects/{projectUuid}/warehouse-connection-user-credentials')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('Projects')
@Hidden()
export class WarehouseConnectionUserCredentialsController extends BaseController {
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/')
    @OperationId('listWarehouseConnectionsForUserCredentials')
    async listWarehouseConnectionsForUserCredentials(
        @Path() projectUuid: UUID,
        @Request() req: express.Request,
    ): Promise<ApiWarehouseConnectionsForUserCredentialsResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getWarehouseConnectionService()
                .listForUserCredentials(req.account, projectUuid),
        };
    }
}
