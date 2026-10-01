import {
    ApiErrorPayload,
    assertRegisteredAccount,
    type ApiWarehouseConnectionStagedTestResponse,
    type CreateWarehouseCredentials,
} from '@lightdash/common';
import {
    Body,
    Middlewares,
    OperationId,
    Post,
    Request,
    Response,
    Route,
    SuccessResponse,
    Tags,
} from '@tsoa/runtime';
import express from 'express';
import { allowApiKeyAuthentication, isAuthenticated } from './authentication';
import { BaseController } from './baseController';

@Route('/api/v1/org/warehouse-connection-tests')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('Projects')
export class WarehouseConnectionTestController extends BaseController {
    /**
     * Test warehouse credentials in stages without saving them: reach the
     * host, TLS, sign in, and check access to the schema. A stage the
     * warehouse cannot check on its own is reported as not checked separately.
     * @summary Run a staged warehouse connection test
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post()
    @OperationId('runStagedWarehouseConnectionTest')
    async runStagedWarehouseConnectionTest(
        @Request() req: express.Request,
        @Body() body: { warehouseConnection: CreateWarehouseCredentials },
    ): Promise<ApiWarehouseConnectionStagedTestResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getProjectService()
                .runStagedWarehouseConnectionTest(
                    req.account,
                    body.warehouseConnection,
                ),
        };
    }
}
