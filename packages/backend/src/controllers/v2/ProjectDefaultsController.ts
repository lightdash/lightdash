import {
    ApiErrorPayload,
    ApiSuccess,
    assertRegisteredAccount,
    ProjectDefaults,
} from '@lightdash/common';
import {
    Body,
    Get,
    Middlewares,
    OperationId,
    Path,
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

@Route('/api/v2/projects/{projectUuid}/defaults')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('v2', 'Projects')
export class ProjectDefaultsController extends BaseController {
    /**
     * Get project defaults configuration
     * @summary Get project defaults
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/')
    @OperationId('getProjectDefaults')
    async getProjectDefaults(
        @Path() projectUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiSuccess<ProjectDefaults | undefined>> {
        const project = await this.services
            .getProjectService()
            .getProject(projectUuid, req.account!);

        return {
            status: 'ok',
            results: project.projectDefaults,
        };
    }

    /**
     * Replace project defaults configuration
     * @summary Replace project defaults
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Put('/')
    @OperationId('replaceProjectDefaults')
    async replaceProjectDefaults(
        @Path() projectUuid: string,
        @Request() req: express.Request,
        @Body() defaults: ProjectDefaults,
    ): Promise<ApiSuccess<undefined>> {
        assertRegisteredAccount(req.account);
        await this.services.getProjectService().replaceProjectDefaults({
            user: toSessionUser(req.account),
            projectUuid,
            defaults,
        });

        return {
            status: 'ok',
            results: undefined,
        };
    }
}
