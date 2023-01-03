import {
    ApiDbtCloudIntegrationSettings,
    ApiDbtCloudMetrics,
    ApiDbtCloudSettingsDeleteSuccess,
    ApiErrorPayload,
} from '@lightdash/common';
import { Controller, Delete } from '@tsoa/runtime';
import express from 'express';
import {
    Get,
    Middlewares,
    OperationId,
    Path,
    Post,
    Request,
    Response,
    Route,
} from 'tsoa';
import { projectService } from '../services/services';
import { isAuthenticated } from './authentication';

@Route('/api/v1/projects/{projectUuid}/integrations/dbt-cloud')
@Response<ApiErrorPayload>('default', 'Error')
export class DbtCloudIntegrationController extends Controller {
    /**
     * Get the current dbt Cloud integration settings for a project
     * @param projectUuid the uuid of the project
     * @param req express request
     */
    @Middlewares([isAuthenticated])
    @Get('/settings')
    @OperationId('getDbtCloudIntegrationSettings')
    async getSettings(
        @Path() projectUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiDbtCloudIntegrationSettings> {
        this.setStatus(200);
        return {
            status: 'ok',
            results: await projectService.findDbtCloudIntegration(
                req.user!,
                projectUuid,
            ),
        };
    }

    /**
     * Update the dbt Cloud integration settings for a project
     * @param projectUuid the uuid of the project
     * @param req express request
     */
    @Middlewares([isAuthenticated])
    @Post('/settings')
    @OperationId('updateDbtCloudIntegrationSettings')
    async updateSettings(
        @Path() projectUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiDbtCloudIntegrationSettings> {
        this.setStatus(200);
        return {
            status: 'ok',
            results: await projectService.upsertDbtCloudIntegration(
                req.user!,
                projectUuid,
                req.body,
            ),
        };
    }

    /**
     * Remove the dbt Cloud integration settings for a project
     */
    @Middlewares([isAuthenticated])
    @Delete('/settings')
    @OperationId('deleteDbtCloudIntegrationSettings')
    async deleteSettings(
        @Path() projectUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiDbtCloudSettingsDeleteSuccess> {
        await projectService.deleteDbtCloudIntegration(req.user!, projectUuid);
        this.setStatus(200);
        return {
            status: 'ok',
            results: undefined,
        };
    }

    /**
     * Get a list of dbt metric definitions from the dbt Cloud metadata api.
     * The metrics are taken from the metadata from a single dbt Cloud job configured
     * with the dbt Cloud integration settings for the project.
     */
    @Middlewares([isAuthenticated])
    @Get('/metrics')
    @OperationId('getDbtCloudMetrics')
    async getMetrics(
        @Path() projectUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiDbtCloudMetrics> {
        this.setStatus(200);
        return {
            status: 'ok',
            results: await projectService.getdbtCloudMetrics(
                req.user!,
                projectUuid,
            ),
        };
    }
}
