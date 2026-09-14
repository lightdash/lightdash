import {
    AnyType,
    ApiAddDeployBatchRequest,
    ApiAddDeployBatchResponse,
    ApiErrorPayload,
    ApiFinalizeDeployResponse,
    ApiSetExploresResponse,
    ApiStartDeploySessionResponse,
    assertRegisteredAccount,
    LightdashCliVersionHeader,
} from '@lightdash/common';
import {
    Body,
    Middlewares,
    OperationId,
    Path,
    Post,
    Put,
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
    unauthorisedInDemo,
} from '../authentication';
import { BaseController } from '../baseController';

@Route('/api/v2/projects/{projectUuid}/deploy')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('Project')
export class DeployController extends BaseController {
    /**
     * Deploy explores with the full dbt model inventory for selective cleanup.
     * @summary Deploy explores
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Put('/')
    @OperationId('deployExplores')
    async deployExplores(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Body() body: {
            explores: AnyType[];
            complete: boolean;
            dbtModelNames: string[];
        },
    ): Promise<ApiSetExploresResponse> {
        assertRegisteredAccount(req.account);
        const results = await this.services
            .getProjectService()
            .setExplores(
                toSessionUser(req.account),
                projectUuid,
                body.explores,
                req.header(LightdashCliVersionHeader),
                body.complete,
                body.dbtModelNames,
            );
        return { status: 'ok', results };
    }

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
            .startDeploySession(req.account!, projectUuid);
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
        @Body() body: AnyType, // ApiAddDeployBatchRequest,
    ): Promise<ApiAddDeployBatchResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        const result = await this.services
            .getDeployService()
            .addDeployBatch(
                toSessionUser(req.account),
                projectUuid,
                sessionUuid,
                (body as unknown as ApiAddDeployBatchRequest).explores,
                (body as unknown as ApiAddDeployBatchRequest).batchNumber,
                (body as unknown as ApiAddDeployBatchRequest).complete,
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
        @Body() body?: { dbtModelNames?: string[] },
    ): Promise<ApiFinalizeDeployResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        const result = await this.services
            .getDeployService()
            .finalizeDeploy(
                toSessionUser(req.account),
                projectUuid,
                sessionUuid,
                req.header(LightdashCliVersionHeader),
                body?.dbtModelNames,
            );
        return {
            status: 'ok',
            results: result,
        };
    }
}
