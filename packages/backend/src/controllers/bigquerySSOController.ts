import {
    ApiBigqueryDatasets,
    ApiBigqueryProjects,
    ApiErrorPayload,
    ApiSuccessEmpty,
} from '@lightdash/common';
import {
    Get,
    Middlewares,
    OperationId,
    Query,
    Request,
    Response,
    Route,
    SuccessResponse,
    Tags,
} from '@tsoa/runtime';
import express from 'express';
import { allowApiKeyAuthentication, isAuthenticated } from './authentication';
import { BaseController } from './baseController';

@Route('/api/v1/bigquery/sso')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('Projects')
export class BigquerySSOController extends BaseController {
    /**
     * Get BigQuery datasets for a project
     * @summary Get BigQuery datasets
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/datasets')
    @OperationId('GetBigQueryDatasets')
    async getBigQueryDatabases(
        @Query() projectId: string,
        @Request() req: express.Request,
    ): Promise<ApiBigqueryDatasets> {
        this.setStatus(200);
        const databases = await this.services
            .getProjectService()
            .getBigqueryDatasets(req.user!, projectId);

        return {
            status: 'ok',
            results: databases,
        };
    }

    /**
     * Get BigQuery projects accessible by the user
     * @summary Get BigQuery projects
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/projects')
    @OperationId('GetBigQueryProjects')
    async getBigQueryProjects(
        @Request() req: express.Request,
    ): Promise<ApiBigqueryProjects> {
        this.setStatus(200);
        const projects = await this.services
            .getProjectService()
            .getBigqueryProjects(req.user!);

        return {
            status: 'ok',
            results: projects,
        };
    }

    /**
     * Check if user is authenticated with BigQuery
     * @summary Check BigQuery authentication
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/is-authenticated')
    @OperationId('checkBigqueryAuthentication')
    async get(@Request() req: express.Request): Promise<ApiSuccessEmpty> {
        this.setStatus(200);
        // This will throw an error if the user is not authenticated with bigquery scopes
        await this.services
            .getUserService()
            .getAccessToken(req.user!, 'bigquery');
        return {
            status: 'ok',
            results: undefined,
        };
    }
}
