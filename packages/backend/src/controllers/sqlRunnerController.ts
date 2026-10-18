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
    Deprecated,
    Extension,
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
import { requireOAuthScopeOperation } from '../auth/oauthScopes/unchecked';
import {
    allowApiKeyAuthentication,
    getDeprecatedRouteMiddleware,
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
     *
     * @deprecated Use POST /api/v2/projects/{projectUuid}/query/sql instead
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
        getDeprecatedRouteMiddleware(new Date('2026-06-10'), {
            suffixMessage:
                'Use POST /api/v2/projects/{projectUuid}/query/sql instead.',
        }),
    ])
    @SuccessResponse('200', 'Success')
    @Post('/run')
    @OperationId('runSql')
    @Deprecated()
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
                    QueryExecutionContext.SQL_RUNNER,
                    req.account,
                ),
        };
    }

    /**
     * Run a SQL pivot query
     * @summary Run SQL pivot query
     *
     * @deprecated Use POST /api/v2/projects/{projectUuid}/query/sql with pivotConfiguration instead
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
        getDeprecatedRouteMiddleware(new Date('2026-06-10'), {
            suffixMessage:
                'Use POST /api/v2/projects/{projectUuid}/query/sql with pivotConfiguration instead.',
        }),
    ])
    @SuccessResponse('200', 'Success')
    @Post('/runPivotQuery')
    @OperationId('runSqlPivotQuery')
    @Deprecated()
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
                    req.account,
                ),
        };
    }

    /**
     * Get results from a file stored locally
     * @summary Get stored results
     * @param fileId the fileId for the file
     * @param projectUuid the uuid for the project
     * @param req express request
     *
     * @deprecated Use GET /api/v2/projects/{projectUuid}/query/{queryUuid}/results instead
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        getDeprecatedRouteMiddleware(new Date('2026-06-10'), {
            suffixMessage:
                'Use GET /api/v2/projects/{projectUuid}/query/{queryUuid}/results instead.',
        }),
    ])
    @SuccessResponse('200', 'Success')
    @Get('results/{fileId}')
    @OperationId('getLocalResults')
    @Deprecated()
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
            .getFileStream(
                toSessionUser(req.account),
                projectUuid,
                fileId,
                req.account,
            );

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
     * Deprecated — use the v2 Get chart endpoint instead.
     *
     * This endpoint was deprecated on 18 October 2026 and will sunset on 18 January 2027. SQL charts are saved charts whose query is a one-node SQL pipeline; read them with the v2 Get chart endpoint and run them with Execute saved chart.
     * @summary Get SQL chart
     * @deprecated Use GET /api/v2/projects/{projectUuid}/saved/{uuidOrSlug} instead
     * @param projectUuid the uuid for the project
     * @param uuid the uuid for the saved sql chart
     * @param req express request
     */
    @Extension('x-mint', {
        content: `<Warning>
**This endpoint is deprecated and will sunset on 18 January 2027.**

SQL charts are saved charts whose query is a one-node SQL pipeline. Read them with [Get chart](https://docs.lightdash.com/api-reference/v2/get-chart) (\`GET /api/v2/projects/{projectUuid}/saved/{uuidOrSlug}\`) and run them with [Execute saved chart](https://docs.lightdash.com/api-reference/v2/execute-saved-chart) (\`POST /api/v2/projects/{projectUuid}/query/chart\`).
</Warning>`,
    })
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        getDeprecatedRouteMiddleware(new Date('2026-10-18'), {
            suffixMessage:
                'Use GET /api/v2/projects/{projectUuid}/saved/{uuidOrSlug} instead.',
        }),
    ])
    @SuccessResponse('200', 'Success')
    @Get('saved/{uuid}')
    @Deprecated()
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
                .getSqlChartFromAccount(req.account!, projectUuid, uuid),
        };
    }

    /**
     * Deprecated — use the v2 Get chart endpoint instead.
     *
     * This endpoint was deprecated on 18 October 2026 and will sunset on 18 January 2027. The v2 Get chart endpoint resolves a chart by uuid or slug.
     * @summary Get SQL chart by slug
     * @deprecated Use GET /api/v2/projects/{projectUuid}/saved/{uuidOrSlug} instead
     * @param projectUuid the uuid for the project
     * @param slug the slug for the saved sql chart
     * @param req express request
     */
    @Extension('x-mint', {
        content: `<Warning>
**This endpoint is deprecated and will sunset on 18 January 2027.**

Read the chart by slug with [Get chart](https://docs.lightdash.com/api-reference/v2/get-chart) (\`GET /api/v2/projects/{projectUuid}/saved/{uuidOrSlug}\`).
</Warning>`,
    })
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        getDeprecatedRouteMiddleware(new Date('2026-10-18'), {
            suffixMessage:
                'Use GET /api/v2/projects/{projectUuid}/saved/{uuidOrSlug} instead.',
        }),
    ])
    @SuccessResponse('200', 'Success')
    @Get('saved/slug/{slug}')
    @Deprecated()
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
                .getSqlChartFromAccount(
                    req.account!,
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
     *
     * @deprecated Use POST /api/v2/projects/{projectUuid}/query/sql-chart with the chart slug instead
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        getDeprecatedRouteMiddleware(new Date('2026-06-10'), {
            suffixMessage:
                'Use POST /api/v2/projects/{projectUuid}/query/sql-chart with the chart slug instead.',
        }),
        requireOAuthScopeOperation('SqlRunnerController.getSavedSqlResultsJob'),
    ])
    @SuccessResponse('200', 'Success')
    @Get('saved/slug/{slug}/results-job')
    @OperationId('getSavedSqlResultsJob')
    @Deprecated()
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
                    req.account,
                ),
        };
    }

    /**
     * Schedules a job to get its results
     * @summary Get SQL chart results job by UUID
     * @param projectUuid - the uuid of the project
     * @param uuid - the uuid of the saved chart
     * @param req - express request
     *
     * @deprecated Use POST /api/v2/projects/{projectUuid}/query/sql-chart with savedSqlUuid instead
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        getDeprecatedRouteMiddleware(new Date('2026-06-10'), {
            suffixMessage:
                'Use POST /api/v2/projects/{projectUuid}/query/sql-chart with savedSqlUuid instead.',
        }),
        requireOAuthScopeOperation(
            'SqlRunnerController.getSavedSqlResultsJobByUuid',
        ),
    ])
    @SuccessResponse('200', 'Success')
    @Get('saved/{uuid}/results-job')
    @OperationId('getSavedSqlResultsJobByUuid')
    @Deprecated()
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
                    req.account,
                ),
        };
    }

    /**
     * Deprecated — use the saved charts endpoint instead.
     *
     * This endpoint was deprecated on 18 October 2026 and will sunset on 18 January 2027. Create the chart with POST /api/v1/projects/{projectUuid}/saved, passing the statement as a one-node SQL pipeline and the explorer chart config.
     * @summary Create SQL chart
     * @deprecated Use POST /api/v1/projects/{projectUuid}/saved with a SQL pipeline instead
     * @param projectUuid the uuid for the project
     * @param req express request
     * @param body the sql chart to create
     */
    @Extension('x-mint', {
        content: `<Warning>
**This endpoint is deprecated and will sunset on 18 January 2027.**

Create the chart with \`POST /api/v1/projects/{projectUuid}/saved\`, passing the statement as a one-node SQL \`pipeline\` (\`queries: [{ sourceType: "sql", nodeId: "sql", sql, limit }]\`, \`terminalNodeId: "sql"\`, the result \`columns\`) and the chart config as drawn in the explorer.
</Warning>`,
    })
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
        getDeprecatedRouteMiddleware(new Date('2026-10-18'), {
            suffixMessage:
                'Use POST /api/v1/projects/{projectUuid}/saved with a SQL pipeline instead.',
        }),
    ])
    @SuccessResponse('200', 'Success')
    @Post('saved')
    @Deprecated()
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
     * Deprecated — use the saved charts endpoints instead.
     *
     * This endpoint was deprecated on 18 October 2026 and will sunset on 18 January 2027. Rename or move the chart with PATCH /api/v1/saved/{chartUuid}; change its statement or chart config by adding a version with POST /api/v1/saved/{chartUuid}/version.
     * @summary Update SQL chart
     * @deprecated Use PATCH /api/v1/saved/{chartUuid} and POST /api/v1/saved/{chartUuid}/version instead
     * @param uuid the uuid for the saved sql chart
     * @param projectUuid the uuid for the project
     * @param req express request
     * @param body the sql chart details to update
     */
    @Extension('x-mint', {
        content: `<Warning>
**This endpoint is deprecated and will sunset on 18 January 2027.**

Rename or move the chart with \`PATCH /api/v1/saved/{chartUuid}\`. Change its statement or chart config by adding a version with \`POST /api/v1/saved/{chartUuid}/version\`, passing the new one-node SQL \`pipeline\`.
</Warning>`,
    })
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
        getDeprecatedRouteMiddleware(new Date('2026-10-18'), {
            suffixMessage:
                'Use PATCH /api/v1/saved/{chartUuid} and POST /api/v1/saved/{chartUuid}/version instead.',
        }),
    ])
    @SuccessResponse('200', 'Success')
    @Patch('saved/{uuid}')
    @Deprecated()
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
     * Deprecated — use the v2 Delete chart endpoint instead.
     *
     * This endpoint was deprecated on 18 October 2026 and will sunset on 18 January 2027. SQL charts are saved charts; delete them like any other chart.
     * @summary Delete SQL chart
     * @deprecated Use DELETE /api/v2/projects/{projectUuid}/saved/{uuidOrSlug} instead
     * @param uuid the uuid for the saved sql chart
     * @param projectUuid the uuid for the project
     * @param req express request
     */
    @Extension('x-mint', {
        content: `<Warning>
**This endpoint is deprecated and will sunset on 18 January 2027.**

Delete the chart with [Delete chart](https://docs.lightdash.com/api-reference/v2/delete-chart) (\`DELETE /api/v2/projects/{projectUuid}/saved/{uuidOrSlug}\`).
</Warning>`,
    })
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
        getDeprecatedRouteMiddleware(new Date('2026-10-18'), {
            suffixMessage:
                'Use DELETE /api/v2/projects/{projectUuid}/saved/{uuidOrSlug} instead.',
        }),
    ])
    @SuccessResponse('200', 'Success')
    @Delete('saved/{uuid}')
    @Deprecated()
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
     * Deprecated — use the Promote chart endpoint instead.
     *
     * This endpoint was deprecated on 18 October 2026 and will sunset on 18 January 2027. SQL charts are saved charts; promote them like any other chart.
     * @summary Promote SQL chart
     * @deprecated Use POST /api/v1/saved/{chartUuid}/promote instead
     * @param uuid the uuid for the saved sql chart
     * @param projectUuid the uuid for the project
     * @param req express request
     */
    @Extension('x-mint', {
        content: `<Warning>
**This endpoint is deprecated and will sunset on 18 January 2027.**

Promote the chart with [Promote chart](https://docs.lightdash.com/api-reference/v1/promote-chart) (\`POST /api/v1/saved/{chartUuid}/promote\`).
</Warning>`,
    })
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
        getDeprecatedRouteMiddleware(new Date('2026-10-18'), {
            suffixMessage:
                'Use POST /api/v1/saved/{chartUuid}/promote instead.',
        }),
    ])
    @SuccessResponse('200', 'Success')
    @Post('saved/{uuid}/promote')
    @Deprecated()
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
     * Deprecated — use the Get chart promotion diff endpoint instead.
     *
     * This endpoint was deprecated on 18 October 2026 and will sunset on 18 January 2027. SQL charts are saved charts; diff them like any other chart.
     * @summary Get SQL chart promotion diff
     * @deprecated Use GET /api/v1/saved/{chartUuid}/promoteDiff instead
     * @param uuid the uuid for the saved sql chart
     * @param projectUuid the uuid for the project
     * @param req express request
     */
    @Extension('x-mint', {
        content: `<Warning>
**This endpoint is deprecated and will sunset on 18 January 2027.**

Diff the chart with [Get chart promotion diff](https://docs.lightdash.com/api-reference/v1/get-chart-promotion-diff) (\`GET /api/v1/saved/{chartUuid}/promoteDiff\`).
</Warning>`,
    })
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        getDeprecatedRouteMiddleware(new Date('2026-10-18'), {
            suffixMessage:
                'Use GET /api/v1/saved/{chartUuid}/promoteDiff instead.',
        }),
    ])
    @SuccessResponse('200', 'Success')
    @Get('saved/{uuid}/promoteDiff')
    @Deprecated()
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
        const { name, label, sql, columns, parameterValues } = body;

        const virtualViewName = await this.services
            .getProjectService()
            .createVirtualView(
                req.account!,
                projectUuid,
                {
                    name,
                    label,
                    sql,
                    columns,
                    parameterValues,
                    warehouseConnectionUuid: body.warehouseConnectionUuid,
                },
                true,
            );

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
     * Deprecated — use the v2 List chart schedulers endpoint instead.
     *
     * This endpoint was deprecated on 18 October 2026 and will sunset on 18 January 2027. SQL charts are saved charts; list their schedulers like any other chart's.
     * @summary List SQL chart schedulers
     * @deprecated Use GET /api/v2/saved/{chartUuid}/schedulers instead
     */
    @Extension('x-mint', {
        content: `<Warning>
**This endpoint is deprecated and will sunset on 18 January 2027.**

List the chart's schedulers with [List chart schedulers](https://docs.lightdash.com/api-reference/v2/list-chart-schedulers) (\`GET /api/v2/saved/{chartUuid}/schedulers\`).
</Warning>`,
    })
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        requireOAuthScopeOperation('SqlRunnerController.getSqlChartSchedulers'),
        getDeprecatedRouteMiddleware(new Date('2026-10-18'), {
            suffixMessage:
                'Use GET /api/v2/saved/{chartUuid}/schedulers instead.',
        }),
    ])
    @SuccessResponse('200', 'Success')
    @Get('/saved/{savedSqlUuid}/schedulers')
    @Deprecated()
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
     * Deprecated — use the Create saved chart scheduler endpoint instead.
     *
     * This endpoint was deprecated on 18 October 2026 and will sunset on 18 January 2027. SQL charts are saved charts; schedule them like any other chart.
     * @summary Create SQL chart scheduler
     * @deprecated Use POST /api/v1/saved/{chartUuid}/schedulers instead
     */
    @Extension('x-mint', {
        content: `<Warning>
**This endpoint is deprecated and will sunset on 18 January 2027.**

Create the scheduler with [Create saved chart scheduler](https://docs.lightdash.com/api-reference/v1/create-saved-chart-scheduler) (\`POST /api/v1/saved/{chartUuid}/schedulers\`).
</Warning>`,
    })
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
        getDeprecatedRouteMiddleware(new Date('2026-10-18'), {
            suffixMessage:
                'Use POST /api/v1/saved/{chartUuid}/schedulers instead.',
        }),
    ])
    @SuccessResponse('201', 'Created')
    @Post('/saved/{savedSqlUuid}/schedulers')
    @Deprecated()
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
