import {
    assertRegisteredAccount,
    ContentAsCodeType,
    type AgentAsCode,
    type AlertAsCode,
    type AnyType,
    type ApiAgentAsCodeListResponse,
    type ApiAgentAsCodeUpsertResponse,
    type ApiAlertAsCodeListResponse,
    type ApiAlertAsCodeUpsertResponse,
    type ApiChartAsCodeListResponse,
    type ApiChartAsCodeUpsertResponse,
    type ApiDashboardAsCodeListResponse,
    type ApiDashboardAsCodeUpsertResponse,
    type ApiErrorPayload,
    type ApiGoogleSheetsSyncAsCodeListResponse,
    type ApiGoogleSheetsSyncAsCodeUpsertResponse,
    type ApiScheduledDeliveryAsCodeListResponse,
    type ApiScheduledDeliveryAsCodeUpsertResponse,
    type ApiSpaceAsCodeListResponse,
    type ApiSpaceAsCodeUpsertResponse,
    type ApiSqlChartAsCodeListResponse,
    type ApiSqlChartAsCodeUpsertResponse,
    type ApiVirtualViewAsCodeListResponse,
    type ApiVirtualViewAsCodeUpsertResponse,
    type ChartAsCode,
    type DashboardAsCode,
    type GoogleSheetsSyncAsCode,
    type ScheduledDeliveryAsCode,
    type SpaceAsCode,
    type SqlChartAsCode,
    type VirtualViewAsCode,
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
import { BaseController } from './baseController';
import {
    CODE_READ_MIDDLEWARES,
    CODE_WRITE_MIDDLEWARES,
    codeSuccess,
} from './CoderControllerUtils';

type AiAgentCoder = {
    downloadAgents(
        user: ReturnType<typeof toSessionUser>,
        projectUuid: string,
        ids?: string[],
        offset?: number,
    ): Promise<ApiAgentAsCodeListResponse['results']>;
    upsertAgents(
        user: ReturnType<typeof toSessionUser>,
        projectUuid: string,
        agents: AgentAsCode[],
        force?: boolean,
    ): Promise<ApiAgentAsCodeUpsertResponse['results']>;
};

@Route('/api/v1/projects/{projectUuid}')
@Response<ApiErrorPayload>('default', 'Error')
export class ProjectCoderController extends BaseController {
    /**
     * Get charts in code representation
     * @summary List charts as code
     */
    @Tags('Projects')
    @Middlewares(CODE_READ_MIDDLEWARES)
    @SuccessResponse('200', 'Success')
    @Get('/charts/code')
    @OperationId('getChartsAsCode')
    async getChartsAsCode(
        @Path() projectUuid: string,
        @Request() req: express.Request,
        @Query() ids?: string[],
        @Query() offset?: number,
        @Query() languageMap?: boolean,
    ): Promise<ApiChartAsCodeListResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return codeSuccess(
            await this.services
                .getCoderService()
                .getCharts(
                    toSessionUser(req.account),
                    projectUuid,
                    ids,
                    offset,
                    languageMap,
                ),
        );
    }

    /**
     * Get dashboards in code representation
     * @summary List dashboards as code
     */
    @Tags('Projects')
    @Middlewares(CODE_READ_MIDDLEWARES)
    @SuccessResponse('200', 'Success')
    @Get('/dashboards/code')
    @OperationId('getDashboardsAsCode')
    async getDashboardsAsCode(
        @Path() projectUuid: string,
        @Request() req: express.Request,
        @Query() ids?: string[],
        @Query() offset?: number,
        @Query() languageMap?: boolean,
    ): Promise<ApiDashboardAsCodeListResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return codeSuccess(
            await this.services
                .getCoderService()
                .getDashboards(
                    toSessionUser(req.account),
                    projectUuid,
                    ids,
                    offset,
                    languageMap,
                ),
        );
    }

    /**
     * Gets SQL charts in code representation
     * @summary Get SQL charts as code
     */
    @Tags('Projects')
    @Middlewares(CODE_READ_MIDDLEWARES)
    @SuccessResponse('200', 'Success')
    @Get('/sqlCharts/code')
    @OperationId('getSqlChartsAsCode')
    async getSqlChartsAsCode(
        @Path() projectUuid: string,
        @Request() req: express.Request,
        @Query() ids?: string[],
        @Query() offset?: number,
    ): Promise<ApiSqlChartAsCodeListResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return codeSuccess(
            await this.services
                .getCoderService()
                .getSqlCharts(
                    toSessionUser(req.account),
                    projectUuid,
                    ids,
                    offset,
                ),
        );
    }

    /**
     * Get virtual views in code representation
     * @summary List virtual views as code
     */
    @Tags('Projects')
    @Middlewares(CODE_READ_MIDDLEWARES)
    @SuccessResponse('200', 'Success')
    @Get('/virtualViews/code')
    @OperationId('getVirtualViewsAsCode')
    async getVirtualViewsAsCode(
        @Path() projectUuid: string,
        @Request() req: express.Request,
        @Query() slugs?: string[],
    ): Promise<ApiVirtualViewAsCodeListResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return codeSuccess(
            await this.services
                .getCoderService()
                .getVirtualViews(
                    toSessionUser(req.account),
                    projectUuid,
                    slugs,
                ),
        );
    }

    /**
     * Get scheduled deliveries in code representation
     * @summary List scheduled deliveries as code
     */
    @Tags('Projects')
    @Middlewares(CODE_READ_MIDDLEWARES)
    @SuccessResponse('200', 'Success')
    @Get('/scheduledDeliveries/code')
    @OperationId('getScheduledDeliveriesAsCode')
    async getScheduledDeliveriesAsCode(
        @Path() projectUuid: string,
        @Request() req: express.Request,
        @Query() slugs?: string[],
    ): Promise<ApiScheduledDeliveryAsCodeListResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return codeSuccess(
            await this.services
                .getCoderService()
                .getScheduledDeliveries(
                    toSessionUser(req.account),
                    projectUuid,
                    slugs,
                ),
        );
    }

    /**
     * Get alerts in code representation
     * @summary List alerts as code
     */
    @Tags('Projects')
    @Middlewares(CODE_READ_MIDDLEWARES)
    @SuccessResponse('200', 'Success')
    @Get('/alerts/code')
    @OperationId('getAlertsAsCode')
    async getAlertsAsCode(
        @Path() projectUuid: string,
        @Request() req: express.Request,
        @Query() slugs?: string[],
    ): Promise<ApiAlertAsCodeListResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return codeSuccess(
            await this.services
                .getCoderService()
                .getScheduledDeliveries(
                    toSessionUser(req.account),
                    projectUuid,
                    slugs,
                    ContentAsCodeType.ALERT,
                ),
        );
    }

    /**
     * Get Google Sheets syncs in code representation
     * @summary List Google Sheets syncs as code
     */
    @Tags('Projects')
    @Middlewares(CODE_READ_MIDDLEWARES)
    @SuccessResponse('200', 'Success')
    @Get('/googleSheets/code')
    @OperationId('getGoogleSheetsSyncsAsCode')
    async getGoogleSheetsSyncsAsCode(
        @Path() projectUuid: string,
        @Request() req: express.Request,
        @Query() slugs?: string[],
    ): Promise<ApiGoogleSheetsSyncAsCodeListResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return codeSuccess(
            await this.services
                .getCoderService()
                .getScheduledDeliveries(
                    toSessionUser(req.account),
                    projectUuid,
                    slugs,
                    ContentAsCodeType.GOOGLE_SHEETS_SYNC,
                ),
        );
    }

    /**
     * Get spaces and their direct access policy in code representation
     * @summary List spaces as code
     */
    @Tags('Spaces')
    @Middlewares(CODE_READ_MIDDLEWARES)
    @SuccessResponse('200', 'Success')
    @Get('/code/spaces')
    @OperationId('getCodeSpaces')
    async getCodeSpaces(
        @Path() projectUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiSpaceAsCodeListResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return codeSuccess(
            await this.services
                .getCoderService()
                .getSpaces(req.account, projectUuid),
        );
    }

    /**
     * @summary List spaces as code (deprecated)
     * @deprecated Use GET /code/spaces. Scheduled for removal after 2026-08-17.
     */
    @Tags('Spaces')
    @Middlewares(CODE_READ_MIDDLEWARES)
    @SuccessResponse('200', 'Success')
    @Get('/spaces/code')
    @OperationId('getSpacesAsCode')
    async getSpacesAsCode(
        @Path() projectUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiSpaceAsCodeListResponse> {
        return this.getCodeSpaces(projectUuid, req);
    }

    @Middlewares(CODE_READ_MIDDLEWARES)
    @SuccessResponse('200', 'Success')
    @Get('/aiAgents/code')
    @OperationId('getAiAgentsAsCode')
    async getAiAgentsAsCode(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Query() ids?: string[],
        @Query() offset?: number,
    ): Promise<ApiAgentAsCodeListResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return codeSuccess(
            await this.services
                .getAiAgentCoderService<AiAgentCoder>()
                .downloadAgents(
                    toSessionUser(req.account),
                    projectUuid,
                    ids,
                    offset,
                ),
        );
    }

    /**
     * Upsert a virtual view from code representation
     * @summary Upsert virtual view as code
     */
    @Tags('Projects')
    @Middlewares(CODE_READ_MIDDLEWARES)
    @SuccessResponse('200', 'Success')
    @Post('/virtualViews/{slug}/code')
    @OperationId('upsertVirtualViewAsCode')
    async upsertVirtualViewAsCode(
        @Path() projectUuid: string,
        @Path() slug: string,
        @Body() virtualView: VirtualViewAsCode,
        @Request() req: express.Request,
        @Query() force: boolean = false,
    ): Promise<ApiVirtualViewAsCodeUpsertResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return codeSuccess(
            await this.services
                .getCoderService()
                .upsertVirtualView(
                    req.account,
                    projectUuid,
                    slug,
                    virtualView,
                    force,
                ),
        );
    }

    /**
     * Upsert a scheduled delivery from code representation
     * @summary Upsert scheduled delivery as code
     */
    @Tags('Projects')
    @Middlewares(CODE_READ_MIDDLEWARES)
    @SuccessResponse('200', 'Success')
    @Post('/scheduledDeliveries/{slug}/code')
    @OperationId('upsertScheduledDeliveryAsCode')
    async upsertScheduledDeliveryAsCode(
        @Path() projectUuid: string,
        @Path() slug: string,
        @Body() delivery: ScheduledDeliveryAsCode,
        @Request() req: express.Request,
        @Query() force: boolean = false,
    ): Promise<ApiScheduledDeliveryAsCodeUpsertResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return codeSuccess(
            await this.services
                .getCoderService()
                .upsertScheduledDelivery(
                    toSessionUser(req.account),
                    projectUuid,
                    slug,
                    delivery,
                    force,
                ),
        );
    }

    /**
     * Upsert an alert from code representation
     * @summary Upsert alert as code
     */
    @Tags('Projects')
    @Middlewares(CODE_READ_MIDDLEWARES)
    @SuccessResponse('200', 'Success')
    @Post('/alerts/{slug}/code')
    @OperationId('upsertAlertAsCode')
    async upsertAlertAsCode(
        @Path() projectUuid: string,
        @Path() slug: string,
        @Body() alert: AlertAsCode,
        @Request() req: express.Request,
        @Query() force: boolean = false,
    ): Promise<ApiAlertAsCodeUpsertResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return codeSuccess(
            await this.services
                .getCoderService()
                .upsertScheduledDelivery(
                    toSessionUser(req.account),
                    projectUuid,
                    slug,
                    alert,
                    force,
                ),
        );
    }

    /**
     * Upsert a Google Sheets sync from code representation
     * @summary Upsert Google Sheets sync as code
     */
    @Tags('Projects')
    @Middlewares(CODE_READ_MIDDLEWARES)
    @SuccessResponse('200', 'Success')
    @Post('/googleSheets/{slug}/code')
    @OperationId('upsertGoogleSheetsSyncAsCode')
    async upsertGoogleSheetsSyncAsCode(
        @Path() projectUuid: string,
        @Path() slug: string,
        @Body() googleSheetsSync: GoogleSheetsSyncAsCode,
        @Request() req: express.Request,
        @Query() force: boolean = false,
    ): Promise<ApiGoogleSheetsSyncAsCodeUpsertResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return codeSuccess(
            await this.services
                .getCoderService()
                .upsertScheduledDelivery(
                    toSessionUser(req.account),
                    projectUuid,
                    slug,
                    googleSheetsSync,
                    force,
                ),
        );
    }

    /**
     * Upsert a chart from code representation
     * @summary Upsert chart as code
     */
    @Tags('Projects')
    @Middlewares(CODE_READ_MIDDLEWARES)
    @SuccessResponse('200', 'Success')
    @Post('/charts/{slug}/code')
    @OperationId('upsertChartAsCode')
    async upsertChartAsCode(
        @Path() projectUuid: string,
        @Path() slug: string,
        @Body()
        chart: Omit<ChartAsCode, 'chartConfig' | 'description'> & {
            skipSpaceCreate?: boolean;
            publicSpaceCreate?: boolean;
            force?: boolean;
            spaceNames?: Record<string, string>;
            chartConfig: AnyType;
            description?: string | null;
        },
        @Request() req: express.Request,
    ): Promise<ApiChartAsCodeUpsertResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return codeSuccess(
            await this.services.getCoderService().upsertChart(
                toSessionUser(req.account),
                projectUuid,
                slug,
                { ...chart, description: chart.description ?? undefined },
                {
                    skipSpaceCreate: chart.skipSpaceCreate,
                    publicSpaceCreate: chart.publicSpaceCreate,
                    force: chart.force,
                    spaceNames: chart.spaceNames,
                },
            ),
        );
    }

    /**
     * Upserts an SQL chart from code representation
     * @summary Upsert SQL chart as code
     */
    @Tags('Projects')
    @Middlewares(CODE_READ_MIDDLEWARES)
    @SuccessResponse('200', 'Success')
    @Post('/sqlCharts/{slug}/code')
    @OperationId('upsertSqlChartAsCode')
    async upsertSqlChartAsCode(
        @Path() projectUuid: string,
        @Path() slug: string,
        @Body()
        sqlChart: Omit<SqlChartAsCode, 'config' | 'description'> & {
            skipSpaceCreate?: boolean;
            publicSpaceCreate?: boolean;
            force?: boolean;
            spaceNames?: Record<string, string>;
            config: AnyType;
            description?: string | null;
        },
        @Request() req: express.Request,
    ): Promise<ApiSqlChartAsCodeUpsertResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return codeSuccess(
            await this.services
                .getCoderService()
                .upsertSqlChart(
                    toSessionUser(req.account),
                    projectUuid,
                    slug,
                    { ...sqlChart, description: sqlChart.description ?? null },
                    sqlChart.skipSpaceCreate,
                    sqlChart.publicSpaceCreate,
                    sqlChart.force,
                    sqlChart.spaceNames,
                ),
        );
    }

    /**
     * Upsert a dashboard from code representation
     * @summary Upsert dashboard as code
     */
    @Tags('Projects')
    @Middlewares(CODE_READ_MIDDLEWARES)
    @SuccessResponse('200', 'Success')
    @Post('/dashboards/{slug}/code')
    @OperationId('upsertDashboardAsCode')
    async upsertDashboardAsCode(
        @Path() projectUuid: string,
        @Path() slug: string,
        @Body()
        dashboard: Omit<DashboardAsCode, 'tiles' | 'description'> & {
            skipSpaceCreate?: boolean;
            publicSpaceCreate?: boolean;
            force?: boolean;
            spaceNames?: Record<string, string>;
            tiles: AnyType;
            description?: string | null;
        },
        @Request() req: express.Request,
    ): Promise<ApiDashboardAsCodeUpsertResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return codeSuccess(
            await this.services.getCoderService().upsertDashboard(
                toSessionUser(req.account),
                projectUuid,
                slug,
                {
                    ...dashboard,
                    description: dashboard.description ?? undefined,
                },
                {
                    skipSpaceCreate: dashboard.skipSpaceCreate,
                    publicSpaceCreate: dashboard.publicSpaceCreate,
                    force: dashboard.force,
                    spaceNames: dashboard.spaceNames,
                },
            ),
        );
    }

    /**
     * Create or update a space and its direct access policy from code
     * @summary Upsert space as code
     */
    @Tags('Spaces')
    @Middlewares(CODE_WRITE_MIDDLEWARES)
    @SuccessResponse('200', 'Success')
    @Post('/code/spaces')
    @OperationId('upsertCodeSpace')
    async upsertCodeSpace(
        @Path() projectUuid: string,
        @Body() space: SpaceAsCode,
        @Request() req: express.Request,
        @Query() skipSpaceCreate: boolean = false,
        @Query() publicSpaceCreate: boolean = false,
    ): Promise<ApiSpaceAsCodeUpsertResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return codeSuccess(
            await this.services
                .getCoderService()
                .upsertSpace(req.account, projectUuid, space, {
                    skipSpaceCreate,
                    publicSpaceCreate,
                }),
        );
    }

    /**
     * @summary Upsert space as code (deprecated)
     * @deprecated Use POST /code/spaces. Scheduled for removal after 2026-08-17.
     */
    @Tags('Spaces')
    @Middlewares(CODE_WRITE_MIDDLEWARES)
    @SuccessResponse('200', 'Success')
    @Post('/spaces/code')
    @OperationId('upsertSpaceAsCode')
    async upsertSpaceAsCode(
        @Path() projectUuid: string,
        @Body() space: SpaceAsCode,
        @Request() req: express.Request,
        @Query() skipSpaceCreate: boolean = false,
        @Query() publicSpaceCreate: boolean = false,
    ): Promise<ApiSpaceAsCodeUpsertResponse> {
        return this.upsertCodeSpace(
            projectUuid,
            space,
            req,
            skipSpaceCreate,
            publicSpaceCreate,
        );
    }

    @Middlewares(CODE_WRITE_MIDDLEWARES)
    @SuccessResponse('200', 'Success')
    @Post('/aiAgents/code')
    @OperationId('upsertAiAgentsAsCode')
    async upsertAiAgentsAsCode(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Body() body: { agents: AgentAsCode[] },
        @Query() force?: boolean,
    ): Promise<ApiAgentAsCodeUpsertResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return codeSuccess(
            await this.services
                .getAiAgentCoderService<AiAgentCoder>()
                .upsertAgents(
                    toSessionUser(req.account),
                    projectUuid,
                    body.agents,
                    force,
                ),
        );
    }
}
