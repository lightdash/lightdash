import {
    ApiCreateSqlChart,
    ApiErrorPayload,
    ApiJobScheduledResponse,
    ApiSqlChart,
    ApiSqlChartWithResults,
    ApiSuccessEmpty,
    ApiUpdateSqlChart,
    ApiWarehouseCatalog,
    ApiWarehouseTableFields,
    CreateSqlChart,
    SqlRunnerBody,
    SqlRunnerPivotQueryBody,
    UpdateSqlChart,
} from '@lightdash/common';
import {
    Body,
    Delete,
    Get,
    Hidden,
    Middlewares,
    OperationId,
    Patch,
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

@Route('/api/v1/projects/{projectUuid}/sqlRunner')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('SQL runner')
@Hidden() // Hide from documentation while in beta
export class SqlRunnerController extends BaseController {
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Get('/tables')
    @OperationId('getTables')
    async getTables(
        @Path() projectUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiWarehouseCatalog> {
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getProjectService()
                .getWarehouseTables(req.user!, projectUuid),
        };
    }

    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Get('/tables/{tableName}')
    @OperationId('getTableFields')
    async getTableFields(
        @Path() projectUuid: string,
        @Path() tableName: string,
        @Request() req: express.Request,
    ): Promise<ApiWarehouseTableFields> {
        this.setStatus(200);

        return {
            status: 'ok',
            results: await this.services
                .getProjectService()
                .getWarehouseFields(req.user!, projectUuid, tableName),
        };
    }

    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Post('/run')
    @OperationId('runSql')
    async runSql(
        @Path() projectUuid: string,
        @Body() body: SqlRunnerBody,
        @Request() req: express.Request,
    ): Promise<ApiJobScheduledResponse> {
        this.setStatus(200);

        return {
            status: 'ok',
            results: await this.services
                .getSavedSqlService()
                .getResultJobFromSql(
                    req.user!,
                    projectUuid,
                    body.sql,
                    body.limit,
                ),
        };
    }

    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Post('/runPivotQuery')
    @OperationId('runSqlPivotQuery')
    async runSqlPivotQuery(
        @Path() projectUuid: string,
        @Body() body: SqlRunnerPivotQueryBody,
        @Request() req: express.Request,
    ): Promise<ApiJobScheduledResponse> {
        this.setStatus(200);

        return {
            status: 'ok',
            results: await this.services
                .getSavedSqlService()
                .getResultJobFromSqlPivotQuery(req.user!, projectUuid, body),
        };
    }

    /**
     * Get results from a file stored locally
     * @param fileId the fileId for the file
     * @param projectUuid the uuid for the project
     * @param req express request
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('results/{fileId}')
    @OperationId('getLocalResults')
    async getLocalResults(
        @Path() fileId: string,
        @Path() projectUuid: string,
        @Request() req: express.Request,
    ): Promise<any> {
        this.setStatus(200);
        this.setHeader('Content-Type', 'application/json');

        const readStream = await this.services
            .getProjectService()
            .getFileStream(req.user!, projectUuid, fileId);

        const { res } = req;
        if (res) {
            readStream.pipe(res);
            await new Promise<void>((resolve, reject) => {
                readStream.on('end', () => {
                    res.end();
                    resolve();
                });
            });
        }
    }

    /**
     * Get saved sql chart
     * @param projectUuid the uuid for the project
     * @param uuid the uuid for the saved sql chart
     * @param req express request
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('saved/{uuid}')
    @OperationId('getSavedSqlChart')
    async getSavedSqlChart(
        @Path() uuid: string,
        @Path() projectUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiSqlChart> {
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getSavedSqlService()
                .getSqlChart(req.user!, projectUuid, uuid),
        };
    }

    /**
     * Get saved sql chart
     * @param projectUuid the uuid for the project
     * @param slug the slug for the saved sql chart
     * @param req express request
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('saved/slug/{slug}')
    @OperationId('getSavedSqlChartBySlug')
    async getSavedSqlChartBySlug(
        @Path() slug: string,
        @Path() projectUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiSqlChart> {
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getSavedSqlService()
                .getSqlChart(req.user!, projectUuid, undefined, slug),
        };
    }

    /**
     * Schedules a job to get its results
     * @param projectUuid - the uuid of the project
     * @param slug - the uuid of the saved chart
     * @param req - express request
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('saved/slug/{slug}/results-job')
    @OperationId('getSavedSqlResultsJob')
    async getSavedSqlResultsJob(
        @Path() slug: string,
        @Path() projectUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiJobScheduledResponse> {
        this.setStatus(200);

        return {
            status: 'ok',
            results: await this.services
                .getSavedSqlService()
                .getSqlChartResultJob(req.user!, projectUuid, slug),
        };
    }

    /**
     * Gets chart and schedules a job to get its results
     * @param projectUuid - the uuid of the project
     * @param uuid - the uuid of the saved chart
     * @param req - express request
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('saved/{uuid}/chart-and-results')
    @OperationId('getSavedSqlChartWithResults')
    async getSavedSqlChartWithResults(
        @Path() uuid: string,
        @Path() projectUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiSqlChartWithResults> {
        this.setStatus(200);

        return {
            status: 'ok',
            results: await this.services
                .getSavedSqlService()
                .getChartWithResultJob(req.user!, projectUuid, uuid),
        };
    }

    /**
     * Create sql chart
     * @param projectUuid the uuid for the project
     * @param req express request
     * @param body the sql chart to create
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Post('saved')
    @OperationId('createSqlChart')
    async createSqlChart(
        @Path() projectUuid: string,
        @Request() req: express.Request,
        @Body() body: CreateSqlChart,
    ): Promise<ApiCreateSqlChart> {
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getSavedSqlService()
                .createSqlChart(req.user!, projectUuid, body),
        };
    }

    /**
     * Update sql chart
     * @param uuid the uuid for the saved sql chart
     * @param projectUuid the uuid for the project
     * @param req express request
     * @param body the sql chart details to update
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Patch('saved/{uuid}')
    @OperationId('updateSqlChart')
    async updateSqlChart(
        @Path() projectUuid: string,
        @Path() uuid: string,
        @Request() req: express.Request,
        @Body() body: UpdateSqlChart,
    ): Promise<ApiUpdateSqlChart> {
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getSavedSqlService()
                .updateSqlChart(req.user!, projectUuid, uuid, body),
        };
    }

    /**
     * Delete sql chart
     * @param uuid the uuid for the saved sql chart
     * @param projectUuid the uuid for the project
     * @param req express request
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Delete('saved/{uuid}')
    @OperationId('deleteSqlChart')
    async deleteSqlChart(
        @Path() projectUuid: string,
        @Path() uuid: string,
        @Request() req: express.Request,
    ): Promise<ApiSuccessEmpty> {
        this.setStatus(200);
        await this.services
            .getSavedSqlService()
            .deleteSqlChart(req.user!, projectUuid, uuid);
        return {
            status: 'ok',
            results: undefined,
        };
    }

    /**
     * Refresh the catalog cache
     * @param uuid the uuid for the saved sql chart
     * @param req express request
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Post('refresh-catalog')
    @OperationId('refreshSqlRunnerCatalog')
    async refreshSqlRunnerCatalog(
        @Path() projectUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiSuccessEmpty> {
        this.setStatus(200);
        await this.services
            .getProjectService()
            .populateWarehouseTablesCache(req.user!, projectUuid);
        return {
            status: 'ok',
            results: undefined,
        };
    }
}
