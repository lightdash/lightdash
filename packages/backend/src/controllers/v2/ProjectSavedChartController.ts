import {
    assertRegisteredAccount,
    type ApiErrorPayload,
    type ApiSavedChartResponse,
    type ApiSuccessEmpty,
} from '@lightdash/common';
import {
    Delete,
    Get,
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
import { toSessionUser } from '../../auth/account';
import {
    allowApiKeyAuthentication,
    isAuthenticated,
    unauthorisedInDemo,
} from '../authentication/middlewares';
import { BaseController } from '../baseController';

@Route('/api/v2/projects/{projectUuid}/saved')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('v2', 'Charts')
export class ProjectSavedChartControllerV2 extends BaseController {
    /**
     * Get a saved chart by uuid or slug within a project
     * @summary Get chart
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/{chartUuidOrSlug}')
    @OperationId('getProjectSavedChart')
    async get(
        @Path() projectUuid: string,
        @Path() chartUuidOrSlug: string,
        @Request() req: express.Request,
    ): Promise<ApiSavedChartResponse> {
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getSavedChartService()
                .get(chartUuidOrSlug, req.account!, { projectUuid }),
        };
    }

    /**
     * Delete a saved chart by uuid or slug within a project
     * @summary Delete chart
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Delete('/{chartUuidOrSlug}')
    @OperationId('deleteProjectSavedChart')
    async delete(
        @Path() projectUuid: string,
        @Path() chartUuidOrSlug: string,
        @Request() req: express.Request,
    ): Promise<ApiSuccessEmpty> {
        assertRegisteredAccount(req.account);
        await this.services
            .getSavedChartService()
            .delete(toSessionUser(req.account), chartUuidOrSlug, {
                projectUuid,
            });
        this.setStatus(200);
        return {
            status: 'ok',
            results: undefined,
        };
    }
}
