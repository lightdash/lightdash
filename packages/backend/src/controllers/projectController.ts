import {
    AnyType,
    ApiCalculateTotalResponse,
    ApiChartAsCodeListResponse,
    ApiChartAsCodeUpsertResponse,
    ApiChartListResponse,
    ApiChartSummaryListResponse,
    ApiCreateTagResponse,
    ApiDashboardAsCodeListResponse,
    ApiDashboardAsCodeUpsertResponse,
    ApiErrorPayload,
    ApiGetProjectGroupAccesses,
    ApiGetProjectMemberResponse,
    ApiProjectAccessListResponse,
    ApiProjectResponse,
    ApiSpaceSummaryListResponse,
    ApiSqlQueryResults,
    ApiSuccessEmpty,
    CalculateTotalFromQuery,
    ChartAsCode,
    CreateProjectMember,
    DashboardAsCode,
    DbtExposure,
    DbtProjectEnvironmentVariable,
    LightdashRequestMethodHeader,
    ParameterError,
    RequestMethod,
    UpdateMetadata,
    UpdateProjectMember,
    UserWarehouseCredentials,
    getRequestMethod,
    isDuplicateDashboardParams,
    type ApiCalculateSubtotalsResponse,
    type ApiCreateDashboardResponse,
    type ApiGetDashboardsResponse,
    type ApiGetTagsResponse,
    type ApiRefreshResults,
    type ApiSuccess,
    type ApiUpdateDashboardsResponse,
    type CalculateSubtotalsFromQuery,
    type CreateDashboard,
    type DuplicateDashboardParams,
    type Tag,
    type UpdateMultipleDashboards,
    type UpdateSchedulerSettings,
} from '@lightdash/common';
import {
    Body,
    Delete,
    Deprecated,
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
import type { DbTagUpdate } from '../database/entities/tags';
import {
    allowApiKeyAuthentication,
    isAuthenticated,
    unauthorisedInDemo,
} from './authentication';
import { BaseController } from './baseController';

@Route('/api/v1/projects')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('Projects')
export class ProjectController extends BaseController {
    /**
     * Get a project of an organiztion
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('{projectUuid}')
    @OperationId('GetProject')
    async getProject(
        @Path() projectUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiProjectResponse> {
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getProjectService()
                .getProject(projectUuid, req.user!),
        };
    }

    /**
     * List all charts in a project
     * @param projectUuid The uuid of the project to get charts for
     * @param req express request
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('{projectUuid}/charts')
    @OperationId('ListChartsInProject')
    async getChartsInProject(
        @Path() projectUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiChartListResponse> {
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getProjectService()
                .getCharts(req.user!, projectUuid),
        };
    }

    /**
     * List all charts summaries in a project
     * @param projectUuid The uuid of the project to get charts for
     * @param req express request
     * @param excludeChartsSavedInDashboard Whether to exclude charts that are saved in dashboards
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('{projectUuid}/chart-summaries')
    @Deprecated()
    @OperationId('ListChartSummariesInProject')
    async getChartSummariesInProject(
        @Path() projectUuid: string,
        @Request() req: express.Request,
        @Query() excludeChartsSavedInDashboard?: boolean,
    ): Promise<ApiChartSummaryListResponse> {
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getProjectService()
                .getChartSummaries(
                    req.user!,
                    projectUuid,
                    excludeChartsSavedInDashboard,
                ),
        };
    }

    /**
     * List all spaces in a project
     * @param projectUuid The uuid of the project to get spaces for
     * @param req express request
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('{projectUuid}/spaces')
    @OperationId('ListSpacesInProject')
    async getSpacesInProject(
        @Path() projectUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiSpaceSummaryListResponse> {
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getProjectService()
                .getSpaces(req.user!, projectUuid),
        };
    }

    /**
     * Get access list for a project. This is a list of users that have been explictly granted access to the project.
     * There may be other users that have access to the project via their organization membership.
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('{projectUuid}/access')
    @OperationId('GetProjectAccessList')
    @Tags('Roles & Permissions')
    async getProjectAccessList(
        @Path() projectUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiProjectAccessListResponse> {
        this.setStatus(200);
        const results = await this.services
            .getProjectService()
            .getProjectAccess(req.user!, projectUuid);
        return {
            status: 'ok',
            results,
        };
    }

    /**
     * Get a project explicit member's access.
     * There may be users that have access to the project via their organization membership.
     *
     * NOTE:
     * We don't use the API on the frontend. Instead, we can call the API
     * so that we make sure of the user's access to the project.
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('{projectUuid}/user/{userUuid}')
    @OperationId('GetProjectMemberAccess')
    @Tags('Roles & Permissions')
    async getProjectMember(
        @Path() projectUuid: string,
        @Path() userUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiGetProjectMemberResponse> {
        const results = await this.services
            .getProjectService()
            .getProjectMemberAccess(req.user!, projectUuid, userUuid);
        this.setStatus(200);
        return {
            status: 'ok',
            results,
        };
    }

    /**
     * Grant a user access to a project
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Post('{projectUuid}/access')
    @OperationId('GrantProjectAccessToUser')
    @Tags('Roles & Permissions')
    async grantProjectAccessToUser(
        @Path() projectUuid: string,
        @Body() body: CreateProjectMember,
        @Request() req: express.Request,
    ): Promise<ApiSuccessEmpty> {
        this.setStatus(200);
        await this.services
            .getProjectService()
            .createProjectAccess(req.user!, projectUuid, body);
        return {
            status: 'ok',
            results: undefined,
        };
    }

    /**
     * Update a user's access to a project
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Patch('{projectUuid}/access/{userUuid}')
    @OperationId('UpdateProjectAccessForUser')
    @Tags('Roles & Permissions')
    async updateProjectAccessForUser(
        @Path() projectUuid: string,
        @Path() userUuid: string,
        @Body() body: UpdateProjectMember,
        @Request() req: express.Request,
    ): Promise<ApiSuccessEmpty> {
        this.setStatus(200);
        await this.services
            .getProjectService()
            .updateProjectAccess(req.user!, projectUuid, userUuid, body);
        return {
            status: 'ok',
            results: undefined,
        };
    }

    /**
     * Remove a user's access to a project
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Delete('{projectUuid}/access/{userUuid}')
    @OperationId('RevokeProjectAccessForUser')
    @Tags('Roles & Permissions')
    async revokeProjectAccessForUser(
        @Path() projectUuid: string,
        @Path() userUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiSuccessEmpty> {
        this.setStatus(200);
        await this.services
            .getProjectService()
            .deleteProjectAccess(req.user!, projectUuid, userUuid);
        return {
            status: 'ok',
            results: undefined,
        };
    }

    /**
     * List group access for projects
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('{projectUuid}/groupAccesses')
    @OperationId('GetProjectGroupAccesses')
    async getProjectGroupAccesses(
        @Path() projectUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiGetProjectGroupAccesses> {
        this.setStatus(200);
        const results = await this.services
            .getProjectService()
            .getProjectGroupAccesses(req.user!, projectUuid);
        return {
            status: 'ok',
            results,
        };
    }

    /**
     * Run a raw sql query against the project's warehouse connection
     * @deprecated Use /api/v1/projects/<project id>/sqlRunner/run instead
     * @param projectUuid The uuid of the project to run the query against
     * @param body The query to run
     * @param req express request
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Post('{projectUuid}/sqlQuery')
    @OperationId('RunSqlQuery')
    @Tags('Exploring')
    @Deprecated()
    async runSqlQuery(
        @Path() projectUuid: string,
        @Body() body: { sql: string },
        @Request() req: express.Request,
    ): Promise<{ status: 'ok'; results: ApiSqlQueryResults }> {
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getProjectService()
                .runSqlQuery(req.user!, projectUuid, body.sql),
        };
    }

    /**
     * Calculate all metric totals from a metricQuery
     * @param projectUuid The uuid of the project to get charts for
     * @param body The metric query to calculate totals for
     * @param req express request
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('{projectUuid}/calculate-total')
    @OperationId('CalculateTotalFromQuery')
    async CalculateTotalFromQuery(
        @Path() projectUuid: string,
        @Body() body: CalculateTotalFromQuery,
        @Request() req: express.Request,
    ): Promise<ApiCalculateTotalResponse> {
        this.setStatus(200);
        const totalResult = await this.services
            .getProjectService()
            .calculateTotalFromQuery(req.user!, projectUuid, body);
        return {
            status: 'ok',
            results: totalResult,
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('{projectUuid}/calculate-subtotals')
    @OperationId('CalculateSubtotalsFromQuery')
    async CalculateSubtotalsFromQuery(
        @Path() projectUuid: string,
        @Body() body: CalculateSubtotalsFromQuery,
        @Request() req: express.Request,
    ): Promise<ApiCalculateSubtotalsResponse> {
        this.setStatus(200);
        const subtotalsResult = await this.services
            .getProjectService()
            .calculateSubtotalsFromQuery(req.user!, projectUuid, body);
        return {
            status: 'ok',
            results: subtotalsResult,
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('{projectUuid}/dbt-exposures')
    @OperationId('GetDbtExposures')
    @Hidden()
    async GetDbtExposures(
        @Path() projectUuid: string,
        @Request() req: express.Request,
    ): Promise<{ status: 'ok'; results: Record<string, DbtExposure> }> {
        this.setStatus(200);
        const exposures = await this.services
            .getProjectService()
            .getDbtExposures(req.user!, projectUuid);
        return {
            status: 'ok',
            results: exposures,
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('{projectUuid}/user-credentials')
    @OperationId('getUserWarehouseCredentialsPreference')
    async getUserWarehouseCredentialsPreference(
        @Path() projectUuid: string,
        @Request() req: express.Request,
    ): Promise<{
        status: 'ok';
        results: UserWarehouseCredentials | undefined;
    }> {
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getProjectService()
                .getProjectCredentialsPreference(req.user!, projectUuid),
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Patch('{projectUuid}/user-credentials/{userWarehouseCredentialsUuid}')
    @OperationId('updateUserWarehouseCredentialsPreference')
    async updateUserWarehouseCredentialsPreference(
        @Path() projectUuid: string,
        @Path() userWarehouseCredentialsUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiSuccessEmpty> {
        this.setStatus(200);
        await this.services
            .getProjectService()
            .upsertProjectCredentialsPreference(
                req.user!,
                projectUuid,
                userWarehouseCredentialsUuid,
            );
        return {
            status: 'ok',
            results: undefined,
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('{projectUuid}/custom-metrics')
    @OperationId('getCustomMetrics')
    async getCustomMetrics(
        @Path() projectUuid: string,
        @Request() req: express.Request,
    ): Promise<{
        status: 'ok';
        results: {
            name: string;
            label: string;
            modelName: string;
            yml: string;
            chartLabel: string;
            chartUrl: string;
        }[];
    }> {
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getProjectService()
                .getCustomMetrics(req.user!, projectUuid),
        };
    }

    /**
     * Update project metadata like upstreamProjectUuid
     * we don't trigger a compile, so not for updating warehouse or credentials
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Patch('{projectUuid}/metadata')
    @OperationId('updateProjectMetadata')
    async updateProjectMetadata(
        @Path() projectUuid: string,
        @Body() body: UpdateMetadata,
        @Request() req: express.Request,
    ): Promise<ApiSuccessEmpty> {
        this.setStatus(200);
        await this.services
            .getProjectService()
            .updateMetadata(req.user!, projectUuid, body);
        return {
            status: 'ok',
            results: undefined,
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('{projectUuid}/dashboards')
    @OperationId('getDashboards')
    async getDashboards(
        @Path() projectUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiGetDashboardsResponse> {
        this.setStatus(200);

        const chartUuid: string | undefined =
            typeof req.query.chartUuid === 'string'
                ? req.query.chartUuid.toString()
                : undefined;

        const includePrivate = req.query.includePrivate !== 'false';

        const results = await this.services
            .getDashboardService()
            .getAllByProject(req.user!, projectUuid, chartUuid, includePrivate);

        return {
            status: 'ok',
            results,
        };
    }

    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('201', 'Created')
    @Post('{projectUuid}/dashboards')
    @OperationId('createDashboard')
    async createDashboard(
        @Path() projectUuid: string,
        @Body() body: DuplicateDashboardParams | CreateDashboard,
        @Request() req: express.Request,
        @Query() duplicateFrom?: string,
    ): Promise<ApiCreateDashboardResponse> {
        const dashboardService = this.services.getDashboardService();
        this.setStatus(201);

        let results: ApiCreateDashboardResponse['results'];

        if (duplicateFrom) {
            if (!isDuplicateDashboardParams(body)) {
                throw new ParameterError(
                    'Invalid parameters to duplicate dashbaord',
                );
            }

            results = await dashboardService.duplicate(
                req.user!,
                projectUuid,
                duplicateFrom.toString(),
                body,
            );
        } else {
            if (isDuplicateDashboardParams(body)) {
                throw new ParameterError(
                    'Invalid parameters to duplicate dashbaord',
                );
            }

            results = await dashboardService.create(
                req.user!,
                projectUuid,
                body,
            );
        }

        return {
            status: 'ok',
            results,
        };
    }

    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Updated')
    @Patch('{projectUuid}/dashboards')
    @OperationId('updateDashboards')
    async updateDashboards(
        @Path() projectUuid: string,
        @Body() body: UpdateMultipleDashboards[],
        @Request() req: express.Request,
    ): Promise<ApiUpdateDashboardsResponse> {
        this.setStatus(200);

        const results = await this.services
            .getDashboardService()
            .updateMultiple(req.user!, projectUuid, body);

        return {
            status: 'ok',
            results,
        };
    }

    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Created')
    @Post('{projectUuid}/createPreview')
    @OperationId('createPreview')
    async createPreview(
        @Path() projectUuid: string,
        @Body()
        body: {
            name: string;
            copyContent: boolean;
            dbtConnectionOverrides?: {
                branch?: string;
                environment?: DbtProjectEnvironmentVariable[];
            };
            warehouseConnectionOverrides?: { schema?: string };
        },
        @Request() req: express.Request,
    ): Promise<{ status: 'ok'; results: string }> {
        this.setStatus(200);

        const results = await this.services
            .getProjectService()
            .createPreview(req.user!, projectUuid, body, RequestMethod.WEB_APP);

        return {
            status: 'ok',
            results,
        };
    }

    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Updated')
    @Patch('{projectUuid}/schedulerSettings')
    @OperationId('updateSchedulerSettings')
    async updateSchedulerSettings(
        @Path() projectUuid: string,
        @Body() body: UpdateSchedulerSettings,
        @Request() req: express.Request,
    ): Promise<ApiSuccessEmpty> {
        this.setStatus(200);

        const { schedulerTimezone: oldDefaultProjectTimezone } =
            await this.services
                .getProjectService()
                .getProject(projectUuid, req.user!);

        await this.services
            .getProjectService()
            .updateDefaultSchedulerTimezone(
                req.user!,
                projectUuid,
                body.schedulerTimezone,
            );

        try {
            await this.services
                .getSchedulerService()
                .updateSchedulersWithDefaultTimezone(req.user!, projectUuid, {
                    oldDefaultProjectTimezone,
                    newDefaultProjectTimezone: body.schedulerTimezone,
                });
        } catch (e) {
            // reset the old timezone when it fails to set the hours
            await this.services
                .getProjectService()
                .updateDefaultSchedulerTimezone(
                    req.user!,
                    projectUuid,
                    oldDefaultProjectTimezone,
                );

            throw e;
        }

        return {
            status: 'ok',
            results: undefined,
        };
    }

    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('201', 'Success')
    @Post('{projectUuid}/tags')
    @OperationId('createTag')
    async createTag(
        @Path() projectUuid: string,
        @Body() body: Pick<Tag, 'name' | 'color'>,
        @Request() req: express.Request,
    ): Promise<ApiCreateTagResponse> {
        const { tagUuid } = await this.services
            .getProjectService()
            .createTag(req.user!, {
                ...body,
                projectUuid,
            });

        this.setStatus(201);

        return {
            status: 'ok',
            results: { tagUuid },
        };
    }

    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('204', 'Deleted')
    @Delete('{projectUuid}/tags/{tagUuid}')
    @OperationId('deleteTag')
    async deleteTag(
        @Path() tagUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiSuccessEmpty> {
        await this.services.getProjectService().deleteTag(req.user!, tagUuid);

        this.setStatus(200);

        return {
            status: 'ok',
            results: undefined,
        };
    }

    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Updated')
    @Patch('{projectUuid}/tags/{tagUuid}')
    @OperationId('updateTag')
    async updateTag(
        @Path() tagUuid: string,
        @Body() body: DbTagUpdate,
        @Request() req: express.Request,
    ): Promise<ApiSuccessEmpty> {
        await this.services
            .getProjectService()
            .updateTag(req.user!, tagUuid, body);

        this.setStatus(200);

        return {
            status: 'ok',
            results: undefined,
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Put('{projectUuid}/tags/yaml')
    @OperationId('replaceYamlTags')
    async replaceYamlTags(
        @Path() projectUuid: string,
        @Body()
        body: (Pick<Tag, 'name' | 'color'> & {
            yamlReference: string;
        })[],
        @Request() req: express.Request,
    ): Promise<ApiSuccessEmpty> {
        await this.services
            .getProjectService()
            .replaceYamlTags(req.user!, projectUuid, body);

        return {
            status: 'ok',
            results: undefined,
        };
    }

    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Get('{projectUuid}/tags')
    @OperationId('getTags')
    async getTags(
        @Path() projectUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiGetTagsResponse> {
        this.setStatus(200);

        const results = await this.services
            .getProjectService()
            .getTags(req.user!, projectUuid);

        return {
            status: 'ok',
            results,
        };
    }

    /** Charts as code */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('{projectUuid}/charts/code')
    @OperationId('getChartsAsCode')
    async getChartsAsCode(
        @Path() projectUuid: string,
        @Request() req: express.Request,
        @Query() ids?: string[],
        @Query() offset?: number,
        @Query() languageMap?: boolean,
    ): Promise<ApiChartAsCodeListResponse> {
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getCoderService()
                .getCharts(req.user!, projectUuid, ids, offset, languageMap),
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('{projectUuid}/dashboards/code')
    @OperationId('getDashboardsAsCode')
    async getDashboardsAsCode(
        @Path() projectUuid: string,
        @Request() req: express.Request,
        @Query() ids?: string[],
        @Query() offset?: number,
        @Query() languageMap?: boolean,
    ): Promise<ApiDashboardAsCodeListResponse> {
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getCoderService()
                .getDashboards(
                    req.user!,
                    projectUuid,
                    ids,
                    offset,
                    languageMap,
                ),
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('{projectUuid}/charts/{slug}/code')
    @OperationId('upsertChartAsCode')
    async upsertChartAsCode(
        @Path() projectUuid: string,
        @Path() slug: string,
        @Body()
        chart: Omit<
            ChartAsCode,
            'metricQuery' | 'chartConfig' | 'description'
        > & {
            chartConfig: AnyType;
            metricQuery: AnyType;
            description?: string | null; // Allow both undefined and null
        },
        @Request() req: express.Request,
    ): Promise<ApiChartAsCodeUpsertResponse> {
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getCoderService()
                .upsertChart(req.user!, projectUuid, slug, {
                    ...chart,
                    description: chart.description ?? undefined,
                }),
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('{projectUuid}/dashboards/{slug}/code')
    @OperationId('upsertDashboardAsCode')
    async upsertDashboardAsCode(
        @Path() projectUuid: string,
        @Path() slug: string,
        @Body()
        dashboard: Omit<
            DashboardAsCode,
            'filters' | 'tiles' | 'description'
        > & {
            filters: AnyType;
            tiles: AnyType;
            description?: string | null; // Allow both undefined and null
        }, // Simplify filter type for tsoa
        @Request() req: express.Request,
    ): Promise<ApiDashboardAsCodeUpsertResponse> {
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getCoderService()
                .upsertDashboard(req.user!, projectUuid, slug, {
                    ...dashboard,
                    description: dashboard.description ?? undefined,
                }),
        };
    }

    @Post('{projectUuid}/dbt-cloud/webhook')
    @OperationId('webhook')
    async testWebhook(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Body() body: AnyType,
    ) {
        // TODO validate webhook signature https://docs.getdbt.com/docs/deploy/webhooks#validate-a-webhook
        if (!body) {
            throw new ParameterError('Invalid body');
        }
        if (body.eventType === 'job.run.completed') {
            // TODO: validate body is an object and has the account id and run id
            const accountId: string = body.accountId as string;
            const runId: string = body.data.runId as string;
            await this.services
                .getProjectService()
                .createPreviewWithExplores(projectUuid, accountId, runId);
        }

        this.setStatus(200);
        return {
            status: 'ok',
        };
    }

    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Post('{projectUuid}/refresh')
    @OperationId('refresh')
    async refresh(
        @Path() projectUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiSuccess<ApiRefreshResults>> {
        this.setStatus(200);
        const context = getRequestMethod(
            req.header(LightdashRequestMethodHeader),
        );
        const results = await this.services
            .getProjectService()
            .scheduleCompileProject(req.user!, projectUuid, context);
        return {
            status: 'ok',
            results,
        };
    }
}
