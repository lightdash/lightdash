import {
    ApiErrorPayload,
    ApiJobScheduledResponse,
    ApiRenameBody,
    ApiRenameChartBody,
    ApiRenameChartResponse,
    ApiRenameFieldsResponse,
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
} from './authentication';
import { BaseController } from './baseController';

@Route('/api/v1/projects/{projectUuid}/rename')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('Projects')
export class RenameController extends BaseController {
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
        this.setStatus(200);
        const context = getRequestMethod(
            req.header(LightdashRequestMethodHeader),
        );

        const scheduledJob = await this.services
            .getRenameService()
            .scheduleRenameResources({
                user: req.user!,
                projectUuid,
                context,
                ...body,
            });

        return {
            status: 'ok',
            results: scheduledJob,
        };
    }

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
        this.setStatus(200);
        const context = getRequestMethod(
            req.header(LightdashRequestMethodHeader),
        );

        const jobId = await this.services.getRenameService().renameChart({
            user: req.user!,
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
        this.setStatus(200);
        const fields = await this.services
            .getRenameService()
            .getFieldsForChart({
                user: req.user!,
                projectUuid,
                chartUuid,
            });

        return {
            status: 'ok',
            results: { fields },
        };
    }
}
