import {
    ApiErrorPayload,
    ApiJobScheduledResponse,
    ApiRenameBody,
    ApiRenameChartBody,
    ApiRenameChartResponse,
    ApiRenameDashboardBody,
    ApiRenameDashboardResponse,
    ApiRenameFieldsResponse,
    ApiRenameResponse,
    assertRegisteredAccount,
    getRequestMethod,
    LightdashRequestMethodHeader,
} from '@lightdash/common';
import {
    Body,
    Get,
    Middlewares,
    OperationId,
    Path,
    Post,
    Query,
    Request,
    Response,
    Route,
    SuccessResponse,
    Tags,
} from '@tsoa/runtime';
import express from 'express';
import { toSessionUser } from '../auth/account';
import {
    allowApiKeyAuthentication,
    isAuthenticated,
    unauthorisedInDemo,
} from './authentication';
import { BaseController } from './baseController';

@Route('/api/v1/projects/{projectUuid}/rename')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('Projects')
export class RenameController extends BaseController {
    /**
     * Rename resources in a project
     * @summary Rename resources
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Post('/')
    @OperationId('rename')
    async rename(
        @Path() projectUuid: string,
        @Request() req: express.Request,
        @Body() body: ApiRenameBody,
    ): Promise<ApiJobScheduledResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        const context = getRequestMethod(
            req.header(LightdashRequestMethodHeader),
        );

        const scheduledJob = await this.services
            .getRenameService()
            .scheduleRenameResources({
                user: toSessionUser(req.account),
                projectUuid,
                context,
                ...body,
            });

        return {
            status: 'ok',
            results: scheduledJob,
        };
    }

    /**
     * Preview which resources would be affected by a bulk rename
     * @summary Preview rename
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Post('/preview')
    @OperationId('previewRename')
    async previewRename(
        @Path() projectUuid: string,
        @Request() req: express.Request,
        @Body() body: ApiRenameBody,
    ): Promise<ApiRenameResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        const context = getRequestMethod(
            req.header(LightdashRequestMethodHeader),
        );

        const results = await this.services
            .getRenameService()
            .previewRenameResources({
                user: toSessionUser(req.account),
                projectUuid,
                context,
                ...body,
            });

        return {
            status: 'ok',
            results,
        };
    }

    /**
     * Rename a chart and its fields
     * @summary Rename chart
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Post('/chart/{chartUuid}')
    @OperationId('renameChart')
    async renameChart(
        @Path() projectUuid: string,
        @Path() chartUuid: string,
        @Request() req: express.Request,
        @Body() body: ApiRenameChartBody,
    ): Promise<ApiRenameChartResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        const context = getRequestMethod(
            req.header(LightdashRequestMethodHeader),
        );

        const jobId = await this.services.getRenameService().renameChart({
            user: toSessionUser(req.account),
            projectUuid,
            context,
            chartUuid,
            ...body,
        });

        return {
            status: 'ok',
            results: { jobId },
        };
    }

    /**
     * Get a list of fields for this chart's explore to be used when renaming a chart in the UI
     * @summary Get chart fields for rename
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Get('/chart/{chartUuid}/fields')
    @OperationId('renameChartFields')
    async renameChartFields(
        @Path() projectUuid: string,
        @Path() chartUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiRenameFieldsResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        const fields = await this.services
            .getRenameService()
            .getFieldsForChart({
                user: toSessionUser(req.account),
                projectUuid,
                chartUuid,
            });

        return {
            status: 'ok',
            results: { fields },
        };
    }

    /**
     * Rename a dashboard filter's field or model reference
     * @summary Rename dashboard filter
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Post('/dashboard/{dashboardUuid}')
    @OperationId('renameDashboardFilter')
    async renameDashboardFilter(
        @Path() projectUuid: string,
        @Path() dashboardUuid: string,
        @Request() req: express.Request,
        @Body() body: ApiRenameDashboardBody,
    ): Promise<ApiRenameDashboardResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        const context = getRequestMethod(
            req.header(LightdashRequestMethodHeader),
        );

        const jobId = await this.services
            .getRenameService()
            .renameDashboardFilter({
                user: toSessionUser(req.account),
                projectUuid,
                context,
                dashboardUuid,
                ...body,
            });

        return {
            status: 'ok',
            results: { jobId },
        };
    }

    /**
     * Get a list of fields from explores referenced by the dashboard's filters
     * @summary Get dashboard fields for rename
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Get('/dashboard/{dashboardUuid}/fields')
    @OperationId('renameDashboardFields')
    async renameDashboardFields(
        @Path() projectUuid: string,
        @Path() dashboardUuid: string,
        @Request() req: express.Request,
        @Query() table?: string,
    ): Promise<ApiRenameFieldsResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        const fields = await this.services
            .getRenameService()
            .getFieldsForDashboard({
                user: toSessionUser(req.account),
                projectUuid,
                dashboardUuid,
                tableName: table,
            });

        return {
            status: 'ok',
            results: { fields },
        };
    }
}
