import {
    assertRegisteredAccount,
    type ApiErrorPayload,
    type ApiProjectNavigationResponse,
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
import { toSessionUser } from '../auth/account';
import { allowApiKeyAuthentication, isAuthenticated } from './authentication';
import { BaseController } from './baseController';

@Route('/api/v1/projects/{projectUuid}/navigation')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('Projects')
@Hidden()
export class ProjectNavigationController extends BaseController {
    /**
     * Which conditional navigation items the current user sees in a project
     * @summary Get project navigation
     * @param projectUuid project uuid
     * @param req express request
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get()
    @OperationId('getProjectNavigation')
    async getProjectNavigation(
        @Path() projectUuid: UUID,
        @Request() req: express.Request,
    ): Promise<ApiProjectNavigationResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getProjectNavigationService()
                .getProjectNavigation(toSessionUser(req.account), projectUuid),
        };
    }
}
