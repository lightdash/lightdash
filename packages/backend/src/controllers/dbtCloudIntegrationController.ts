import {
    ApiDbtCloudIntegrationSettings,
    ApiDbtCloudSettingsDeleteSuccess,
    ApiErrorPayload,
} from '@lightdash/common';
import {
    Delete,
    Get,
    Middlewares,
    OperationId,
    Path,
    Post,
    Request,
    Response,
    Route,
    Tags,
} from '@tsoa/runtime';
import express from 'express';
import { isAuthenticated } from './authentication';
import { BaseController } from './baseController';

@Route('/api/v1/projects/{projectUuid}/integrations/dbt-cloud')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('Integrations')
export class DbtCloudIntegrationController extends BaseController {
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
            results: await this.services
                .getProjectService()
                .findDbtCloudIntegration(req.user!, projectUuid),
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
            results: await this.services
                .getProjectService()
                .upsertDbtCloudIntegration(req.user!, projectUuid, req.body),
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
        await this.services
            .getProjectService()
            .deleteDbtCloudIntegration(req.user!, projectUuid);
        this.setStatus(200);
        return {
            status: 'ok',
            results: undefined,
        };
    }
}
