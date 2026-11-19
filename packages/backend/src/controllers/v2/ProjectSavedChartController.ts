import {
    assertRegisteredAccount,
    type ApiChartParametersResponse,
    type ApiErrorPayload,
    type ApiSavedChartResponse,
    type ApiSuccessEmpty,
    type UuidOrSlug,
} from '@lightdash/common';
import {
    Delete,
    Get,
    Middlewares,
    OperationId,
    Path,
    Query,
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
        @Query() includeUnpublishedDraft?: boolean,
    ): Promise<ApiSavedChartResponse> {
        this.setStatus(200);
        const savedChartService = this.services.getSavedChartService();
        if (includeUnpublishedDraft === true) {
            assertRegisteredAccount(req.account);
            return {
                status: 'ok',
                results: await savedChartService.getForViewer(
                    toSessionUser(req.account),
                    chartUuidOrSlug,
                    req.account,
                    { projectUuid },
                ),
            };
        }
        return {
            status: 'ok',
            results: await savedChartService.get(
                chartUuidOrSlug,
                req.account!,
                { projectUuid },
            ),
        };
    }

    /**
     * List the parameters a saved chart's query uses: each one's definition
     * (label, type, options, default), its current value (saved on the chart,
     * else the default), and whether it is defined in the project or a model.
     * Read from the saved query without running it.
     *
     * Run the chart with other values by passing `parameters` to the v2 query
     * endpoints.
     * @summary Get chart parameters
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/{chartUuidOrSlug}/parameters')
    @OperationId('getProjectSavedChartParameters')
    async getParameters(
        @Path() projectUuid: string,
        @Path() chartUuidOrSlug: UuidOrSlug,
        @Request() req: express.Request,
    ): Promise<ApiChartParametersResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getDashboardService()
                .getChartParameters(req.account, projectUuid, chartUuidOrSlug),
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
