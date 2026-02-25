import {
    ApiAddDeployBatchRequest,
    ApiAddDeployBatchResponse,
    ApiErrorPayload,
    ApiFinalizeDeployResponse,
    ApiStartDeploySessionResponse,
} from '@lightdash/common';
import {
    Body,
    Middlewares,
    OperationId,
    Path,
    Post,
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
    unauthorisedInDemo,
} from '../authentication';
import { BaseController } from '../baseController';

@Route('/api/v2/projects/{projectUuid}/deploy')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('Project')
export class DeployController extends BaseController {
    /**
     * Start a new deploy session for batched explore uploads
     * @summary Start deploy session
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Post('/')
    @OperationId('startDeploySession')
    async startDeploySession(
        @Request() req: express.Request,
        @Path() projectUuid: string,
    ): Promise<ApiStartDeploySessionResponse> {
        this.setStatus(200);
        const result = await this.services
            .getDeployService()
            .startDeploySession(req.user!, projectUuid);
        return {
            status: 'ok',
            results: result,
        };
    }

    /**
     * Add a batch of explores to an existing deploy session
     * @summary Add deploy batch
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Post('/{sessionUuid}/batch')
    @OperationId('addDeployBatch')
    async addDeployBatch(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Path() sessionUuid: string,
        @Body() body: ApiAddDeployBatchRequest,
    ): Promise<ApiAddDeployBatchResponse> {
        this.setStatus(200);
        const result = await this.services
            .getDeployService()
            .addDeployBatch(
                req.user!,
                projectUuid,
                sessionUuid,
                body.explores,
                body.batchNumber,
            );
        return {
            status: 'ok',
            results: result,
        };
    }

    /**
     * Finalize a deploy session and commit all staged explores to the project
     * @summary Finalize deploy
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Post('/{sessionUuid}/finalize')
    @OperationId('finalizeDeploySession')
    async finalizeDeploySession(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Path() sessionUuid: string,
    ): Promise<ApiFinalizeDeployResponse> {
        this.setStatus(200);
        const result = await this.services
            .getDeployService()
            .finalizeDeploy(req.user!, projectUuid, sessionUuid);
        return {
            status: 'ok',
            results: result,
        };
    }
}
