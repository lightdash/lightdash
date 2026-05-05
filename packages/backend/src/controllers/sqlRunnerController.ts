import {
    AnyType,
    ApiCreateSqlChart,
    ApiCreateVirtualView,
    ApiErrorPayload,
    ApiGithubDbtWriteBack,
    ApiGithubDbtWritePreview,
    ApiJobScheduledResponse,
    ApiPromotionChangesResponse,
    ApiSqlChart,
    ApiSuccessEmpty,
    ApiUpdateSqlChart,
    ApiWarehouseTableFields,
    ApiWarehouseTablesCatalog,
    assertRegisteredAccount,
    CreateSchedulerAndTargetsWithoutIds,
    CreateSqlChart,
    CreateVirtualViewPayload,
    QueryExecutionContext,
    SchedulerAndTargets,
    SqlRunnerBody,
    SqlRunnerPivotQueryBody,
    UpdateSqlChart,
    UpdateVirtualViewPayload,
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
    Put,
    Query,
    Request,
    Response,
    Route,
    SuccessResponse,
    Tags,
} from '@tsoa/runtime';
import express from 'express';
import { getContextFromQueryOrHeader } from '../analytics/LightdashAnalytics';
import { toSessionUser } from '../auth/account';
import {
    allowApiKeyAuthentication,
    isAuthenticated,
    unauthorisedInDemo,
} from './authentication';
import { BaseController } from './baseController';

@Route('/api/v1/projects/{projectUuid}/sqlRunner')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('SQL runner')
export class SqlRunnerController extends BaseController {
    /**
     * Get warehouse tables for a project
     * @summary List warehouse tables
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/tables')
    @OperationId('getTables')
    async getTables(
        @Path() projectUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiWarehouseTablesCatalog> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getProjectService()
                .getWarehouseTables(toSessionUser(req.account), projectUuid),
        };
    }

    /**
     * Get fields for a warehouse table
     * @summary Get table fields
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Get('/fields')
    @OperationId('getTableFields')
    async getTableFields(
        @Path() projectUuid: string,
        @Request() req: express.Request,
        @Query() tableName?: string,
        @Query() schemaName?: string,
        @Query() databaseName?: string,
    ): Promise<ApiWarehouseTableFields> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);

        return {
            status: 'ok',
            results: await this.services
                .getProjectService()
                .getWarehouseFields(
                    toSessionUser(req.account),
                    projectUuid,
                    QueryExecutionContext.SQL_RUNNER,
                    tableName,
                    schemaName,
                    databaseName,
                ),
        };
    }

    /**
     * Run a SQL query
     * @summary Run SQL query
     */
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
        assertRegisteredAccount(req.account);
        this.setStatus(200);

        return {
            status: 'ok',
            results: await this.services
                .getSavedSqlService()
                .getResultJobFromSql(
                    toSessionUser(req.account),
                    projectUuid,
                    body.sql,
                    body.limit,
                ),
        };
    }

    /**
     * Run a SQL pivot query
     * @summary Run SQL pivot query
     */
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
        assertRegisteredAccount(req.account);
        this.setStatus(200);

        return {
            status: 'ok',
            results: await this.services
                .getSavedSqlService()
                .getResultJobFromSqlPivotQuery(
                    toSessionUser(req.account),
                    projectUuid,
                    body,
                    getContextFromQueryOrHeader(req),
                ),
        };
    }

    /**
     * Get results from a file stored locally
     * @summary Get stored results
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
    ): Promise<AnyType> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        this.setHeader('Content-Type', 'application/json');

        const readStream = await this.services
            .getProjectService()
            .getFileStream(toSessionUser(req.account), projectUuid, fileId);

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
     * @summary Get SQL chart
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
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getSavedSqlService()
                .getSqlChart(toSessionUser(req.account), projectUuid, uuid),
        };
    }

    /**
     * Get saved sql chart
     * @summary Get SQL chart by slug
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
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getSavedSqlService()
                .getSqlChart(
                    toSessionUser(req.account),
                    projectUuid,
                    undefined,
                    slug,
                ),
        };
    }

    /**
     * Schedules a job to get its results
     * @summary Get SQL chart results job
     * @param projectUuid - the uuid of the project
     * @param slug - the slug of the saved chart
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
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getSavedSqlService()
                .getSqlChartResultJob(
                    toSessionUser(req.account),
                    projectUuid,
                    slug,
                    undefined,
                    getContextFromQueryOrHeader(req),
                ),
        };
    }

    /**
     * Schedules a job to get its results
     * @summary Get SQL chart results job by UUID
     * @param projectUuid - the uuid of the project
     * @param uuid - the uuid of the saved chart
     * @param req - express request
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('saved/{uuid}/results-job')
    @OperationId('getSavedSqlResultsJobByUuid')
    async getSavedSqlResultsJobByUuid(
        @Path() uuid: string,
        @Path() projectUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiJobScheduledResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getSavedSqlService()
                .getSqlChartResultJob(
                    toSessionUser(req.account),
                    projectUuid,
                    undefined,
                    uuid,
                    getContextFromQueryOrHeader(req),
                ),
        };
    }

    /**
     * Create sql chart
     * @summary Create SQL chart
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
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getSavedSqlService()
                .createSqlChart(toSessionUser(req.account), projectUuid, body),
        };
    }

    /**
     * Update sql chart
     * @summary Update SQL chart
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
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getSavedSqlService()
                .updateSqlChart(
                    toSessionUser(req.account),
                    projectUuid,
                    uuid,
                    body,
                ),
        };
    }

    /**
     * Delete sql chart
     * @summary Delete SQL chart
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
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        await this.services
            .getSavedSqlService()
            .delete(toSessionUser(req.account), uuid);
        return {
            status: 'ok',
            results: undefined,
        };
    }

    /**
     * Promote SQL chart to upstream project
     * @summary Promote SQL chart
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
    @Post('saved/{uuid}/promote')
    @OperationId('promoteSqlChart')
    async promoteSqlChart(
        @Path() projectUuid: string,
        @Path() uuid: string,
        @Request() req: express.Request,
    ): Promise<ApiSqlChart> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        const promotedSqlChart = await this.services
            .getPromoteService()
            .promoteSqlChart(toSessionUser(req.account), projectUuid, uuid);

        return {
            status: 'ok',
            results: await this.services
                .getSavedSqlService()
                .getSqlChart(
                    toSessionUser(req.account),
                    promotedSqlChart.projectUuid,
                    promotedSqlChart.savedSqlUuid,
                ),
        };
    }

    /**
     * Get diff from SQL chart to promote
     * @summary Get SQL chart promotion diff
     * @param uuid the uuid for the saved sql chart
     * @param projectUuid the uuid for the project
     * @param req express request
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('saved/{uuid}/promoteDiff')
    @OperationId('promoteSqlChartDiff')
    async promoteSqlChartDiff(
        @Path() projectUuid: string,
        @Path() uuid: string,
        @Request() req: express.Request,
    ): Promise<ApiPromotionChangesResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getPromoteService()
                .getPromoteSqlChartDiff(
                    toSessionUser(req.account),
                    projectUuid,
                    uuid,
                ),
        };
    }

    /**
     * Refresh the catalog cache
     * @summary Refresh catalog cache
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
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        await this.services
            .getProjectService()
            .populateWarehouseTablesCache(
                toSessionUser(req.account),
                projectUuid,
            );
        return {
            status: 'ok',
            results: undefined,
        };
    }

    /**
     * Create a virtual-view
     * @summary Create virtual view
     * @param req express request
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Post('virtual-view')
    @OperationId('createVirtualView')
    async createVirtualView(
        @Path() projectUuid: string,
        @Request() req: express.Request,
        @Body() body: CreateVirtualViewPayload,
    ): Promise<ApiCreateVirtualView> {
        this.setStatus(200);
        const { name, sql, columns, parameterValues } = body;

        const virtualViewName = await this.services
            .getProjectService()
            .createVirtualView(req.account!, projectUuid, {
                name,
                sql,
                columns,
                parameterValues,
            });

        return {
            status: 'ok',
            results: virtualViewName,
        };
    }

    /**
     * Update a virtual view
     * @summary Update virtual view
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Put('virtual-view/{name}')
    @OperationId('updateVirtualView')
    async updateVirtualView(
        @Path() projectUuid: string,
        @Path() name: string,
        @Request() req: express.Request,
        @Body() body: UpdateVirtualViewPayload,
    ): Promise<ApiCreateVirtualView> {
        this.setStatus(200);
        const { name: virtualViewName } = await this.services
            .getProjectService()
            .updateVirtualView(req.account!, projectUuid, name, body);

        return {
            status: 'ok',
            results: {
                name: virtualViewName,
            },
        };
    }

    /**
     * Delete a virtual-view
     * @summary Delete virtual view
     * @param req express request
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Delete('virtual-view/{name}')
    @OperationId('deleteVirtualView')
    async deleteVirtualView(
        @Path() projectUuid: string,
        @Path() name: string,
        @Request() req: express.Request,
    ): Promise<ApiSuccessEmpty> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        await this.services
            .getProjectService()
            .deleteVirtualView(toSessionUser(req.account), projectUuid, name);
        return {
            status: 'ok',
            results: undefined,
        };
    }

    /**
     * Preview write back from SQL runner
     * @summary Preview write back
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Post('preview')
    @OperationId('writeBackPreview')
    async writeBackPreview(
        @Path() projectUuid: string,
        @Request() req: express.Request,
        @Body() body: CreateVirtualViewPayload,
    ): Promise<ApiGithubDbtWritePreview> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        const { name } = body;

        return {
            status: 'ok',
            results: await this.services
                .getGitIntegrationService()
                .writeBackPreview(
                    toSessionUser(req.account),
                    projectUuid,
                    name,
                ),
        };
    }

    /**
     * Write back from SQL runner
     * @summary Create write back PR
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Post('pull-request')
    @OperationId('writeBackCreatePr')
    async writeBackCreatePr(
        @Path() projectUuid: string,
        @Request() req: express.Request,
        @Body() body: CreateVirtualViewPayload,
    ): Promise<ApiGithubDbtWriteBack> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        const { name, sql, columns } = body;

        return {
            status: 'ok',
            results: await this.services
                .getGitIntegrationService()
                .createPullRequestFromSql(
                    toSessionUser(req.account),
                    projectUuid,
                    name,
                    sql,
                    columns,
                ),
        };
    }

    /**
     * Get all schedulers for a SQL chart
     * @summary List SQL chart schedulers
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/saved/{savedSqlUuid}/schedulers')
    @OperationId('getSqlChartSchedulers')
    async getSqlChartSchedulers(
        @Path() projectUuid: string,
        @Path() savedSqlUuid: string,
        @Request() req: express.Request,
    ): Promise<{ status: 'ok'; results: SchedulerAndTargets[] }> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getSavedSqlService()
                .getSchedulers(
                    toSessionUser(req.account),
                    projectUuid,
                    savedSqlUuid,
                ),
        };
    }

    /**
     * Create a scheduler for a SQL chart
     * @summary Create SQL chart scheduler
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('201', 'Created')
    @Post('/saved/{savedSqlUuid}/schedulers')
    @OperationId('createSqlChartScheduler')
    async createSqlChartScheduler(
        @Path() projectUuid: string,
        @Path() savedSqlUuid: string,
        @Body() body: CreateSchedulerAndTargetsWithoutIds,
        @Request() req: express.Request,
    ): Promise<{ status: 'ok'; results: SchedulerAndTargets }> {
        assertRegisteredAccount(req.account);
        this.setStatus(201);
        return {
            status: 'ok',
            results: await this.services
                .getSavedSqlService()
                .createScheduler(
                    toSessionUser(req.account),
                    projectUuid,
                    savedSqlUuid,
                    body,
                ),
        };
    }
}
