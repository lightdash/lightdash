import {
    assertRegisteredAccount,
    type ApiBigqueryWorkloadIdentityResponse,
    type ApiErrorPayload,
    type UUID,
} from '@lightdash/common';
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
import { isAuthenticated, unauthorisedInDemo } from './authentication';
import { BaseController } from './baseController';

@Route('/api/v1/bigquery/workload-identity')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('BigQuery Workload Identity')
export class BigqueryWorkloadIdentityController extends BaseController {
    /**
     * Get the issuer and subject to pin in a workload identity pool provider.
     * @summary Get BigQuery workload identity
     * @param projectUuid The project being edited. Omit when creating a project.
     */
    @Middlewares([isAuthenticated, unauthorisedInDemo])
    @SuccessResponse('200', 'Success')
    @Get('')
    @OperationId('getBigqueryWorkloadIdentity')
    async getIdentity(
        @Request() req: express.Request,
        @Query() projectUuid?: UUID,
    ): Promise<ApiBigqueryWorkloadIdentityResponse> {
        assertRegisteredAccount(req.account);
        const results = await this.services
            .getBigqueryWorkloadIdentityService()
            .getIdentity(req.account, projectUuid);
        this.setStatus(200);
        return { status: 'ok', results };
    }
}
