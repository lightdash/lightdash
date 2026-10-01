import {
    ApiErrorPayload,
    assertRegisteredAccount,
    type ApiProjectSetupResponse,
    type ApiSkipProjectSetupStepResponse,
} from '@lightdash/common';
import {
    Get,
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
import { allowApiKeyAuthentication, isAuthenticated } from './authentication';
import { BaseController } from './baseController';

@Route('/api/v1/projects/{projectUuid}/setup')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('Projects')
export class ProjectSetupController extends BaseController {
    /**
     * Get the setup state of a project: each setup step, its status, and the
     * step to resume. Returns null for projects created without setup tracking.
     * @summary Get project setup state
     * @param projectUuid The uuid of the project
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get()
    @OperationId('getProjectSetup')
    async getProjectSetup(
        @Request() req: express.Request,
        @Path() projectUuid: string,
    ): Promise<ApiProjectSetupResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getProjectSetupService()
                .getProjectSetup(req.account, projectUuid),
        };
    }

    /**
     * Skip the semantic layer step. Setup then finishes as connected.
     * @summary Skip the semantic layer setup step
     * @param projectUuid The uuid of the project
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/semantic-layer/skip')
    @OperationId('skipProjectSetupSemanticLayer')
    async skipSemanticLayer(
        @Request() req: express.Request,
        @Path() projectUuid: string,
    ): Promise<ApiSkipProjectSetupStepResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getProjectSetupService()
                .skipSemanticLayer(req.account, projectUuid),
        };
    }
}
