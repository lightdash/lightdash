import {
    AdditionalMetric,
    AndFilterGroup,
    AnyType,
    ApiCalculateSubtotalsResponse,
    ApiCalculateTotalResponse,
    ApiErrorPayload,
    ApiExecuteAsyncDashboardChartQueryResults,
    ApiExecuteAsyncDashboardSqlChartQueryResults,
    ApiSqlChart,
    ApiSuccessEmpty,
    assertEmbeddedAuth,
    assertSessionAuth,
    CacheMetadata,
    CalculateSubtotalsFromQuery,
    CalculateTotalFromQuery,
    CommonEmbedJwtContent,
    CreateEmbedJwt,
    CreateEmbedRequestBody,
    CreateSavedChart,
    Dashboard,
    DashboardAvailableFilters,
    DashboardFilters,
    DateGranularity,
    DateZoom,
    DecodedEmbed,
    EmbedUrl,
    ExecuteAsyncDashboardChartRequestParams,
    ExecuteAsyncDashboardSqlChartRequestParams,
    Explore,
    FieldValueSearchResult,
    ForbiddenError,
    GetEmbedDashboardRequest,
    Item,
    MetricQueryResponse,
    OrganizationColorPalette,
    ParametersValuesMap,
    SavedChart,
    SavedChartsInfoForDashboardAvailableFilters,
    SortField,
    UpdateEmbed,
} from '@lightdash/common';
import {
    Body,
    Deprecated,
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
} from '@tsoa/runtime';
import express from 'express';
import {
    allowApiKeyAuthentication,
    getDeprecatedRouteMiddleware,
    isAuthenticated,
} from '../../controllers/authentication';
import { BaseController } from '../../controllers/baseController';
import { AppGenerateService } from '../services/AppGenerateService/AppGenerateService';
import { EmbedService } from '../services/EmbedService/EmbedService';

export type ApiEmbedDashboardResponse = {
    status: 'ok';
    results: Dashboard & {
        // declare type as TSOA doesn't understand zod type InteractivityOptions
        dashboardFiltersInteractivity?: CommonEmbedJwtContent['dashboardFiltersInteractivity'];
        parameterInteractivity?: CommonEmbedJwtContent['parameterInteractivity'];
        canExportCsv?: boolean;
        canExportImages?: boolean;
        canExportPagePdf?: boolean;
        canDateZoom?: boolean;
        canExplore?: boolean;
        canViewUnderlyingData?: boolean;
        selectedPalette?: Pick<
            OrganizationColorPalette,
            'colors' | 'darkColors'
        > | null;
    };
};

export type ApiEmbedDashboardAvailableFiltersResponse = {
    status: 'ok';
    results: DashboardAvailableFilters;
};

export type ApiEmbedUrlResponse = {
    status: 'ok';
    results: EmbedUrl;
};

export type ApiEmbedConfigResponse = {
    status: 'ok';
    results: DecodedEmbed;
};

export type ApiEmbedChartAndResultsResponse = {
    status: 'ok';
    results: {
        chart: SavedChart;
        explore: Explore;
        appliedDashboardFilters: DashboardFilters | undefined;
        metricQuery: MetricQueryResponse; // tsoa doesn't support complex types like MetricQuery
        cacheMetadata: CacheMetadata;
        rows: AnyType[];
        fields: Record<string, Item | AdditionalMetric>;
    };
};

export type ApiEmbedSavedChartCreateResponse = {
    status: 'ok';
    results: SavedChart;
};

@Route('/api/v1/embed/:projectUuid')
@Hidden()
@Response<ApiErrorPayload>('default', 'Error')
export class EmbedController extends BaseController {
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/config')
    @OperationId('getEmbedConfig')
    async getEmbedConfig(
        @Request() req: express.Request,
        @Path() projectUuid: string,
    ): Promise<ApiEmbedConfigResponse> {
        this.setStatus(200);
        assertSessionAuth(req.account);
        return {
            status: 'ok',
            results: await this.getEmbedService().getConfig(
                req.account,
                projectUuid,
            ),
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('201', 'Success')
    @Post('/config')
    @OperationId('saveEmbedConfig')
    async saveEmbedConfig(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Body() body: CreateEmbedRequestBody,
    ): Promise<ApiEmbedConfigResponse> {
        this.setStatus(201);
        assertSessionAuth(req.account);
        return {
            status: 'ok',
            results: await this.getEmbedService().createConfig(
                req.account,
                projectUuid,
                body,
            ),
        };
    }

    /**
     * Update the dashboards allowed in the project embed config
     * @summary Update embedded dashboards
     *
     * @deprecated Use PATCH /api/v1/embed/{projectUuid}/config instead
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        getDeprecatedRouteMiddleware(new Date('2026-06-10'), {
            suffixMessage:
                'Use PATCH /api/v1/embed/{projectUuid}/config instead.',
        }),
    ])
    @SuccessResponse('200', 'Success')
    @Patch('/config/dashboards')
    @OperationId('updateEmbeddedDashboards')
    @Deprecated()
    async updateEmbeddedDashboards(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Body() body: UpdateEmbed,
    ): Promise<ApiSuccessEmpty> {
        this.setStatus(200);
        assertSessionAuth(req.account);
        await this.getEmbedService().updateDashboards(
            req.account,
            projectUuid,
            body,
        );
        return {
            status: 'ok',
            results: undefined,
        };
    }

    /**
     * This endpoint is used for updating the embed config for dashboards and charts.
     * @summary Update embed config
     * @param req
     * @param projectUuid
     * @param body Contains dashboardUuids, allowAllDashboards, chartUuids, allowAllCharts
     * @returns Empty response with status 'ok'
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Patch('/config')
    @OperationId('updateEmbedConfig')
    async updateEmbedConfig(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Body() body: UpdateEmbed,
    ): Promise<ApiSuccessEmpty> {
        this.setStatus(200);
        assertSessionAuth(req.account);
        await this.getEmbedService().updateConfig(
            req.account,
            projectUuid,
            body,
        );
        return {
            status: 'ok',
            results: undefined,
        };
    }

    @SuccessResponse('200', 'Success')
    @Post('/get-embed-url')
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @OperationId('getEmbedUrl')
    async getEmbedUrl(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Body() body: CreateEmbedJwt,
    ): Promise<ApiEmbedUrlResponse> {
        this.setStatus(200);
        assertSessionAuth(req.account);
        return {
            status: 'ok',
            results: await this.getEmbedService().getEmbedUrl(
                req.account,
                projectUuid,
                body,
            ),
        };
    }

    @SuccessResponse('200', 'Success')
    @Post('/dashboard')
    @OperationId('getEmbedDashboard')
    async getEmbedDashboard(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Body() body?: GetEmbedDashboardRequest,
    ): Promise<ApiEmbedDashboardResponse> {
        this.setStatus(200);

        assertEmbeddedAuth(req.account);

        return {
            status: 'ok',
            results: await this.getEmbedService().getDashboard(
                projectUuid,
                req.account,
                { paletteUuid: body?.paletteUuid },
            ),
        };
    }

    @SuccessResponse('200', 'Success')
    @Post('/saved')
    @OperationId('createEmbedSavedChart')
    async createEmbedSavedChart(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Body() body: CreateSavedChart,
    ): Promise<ApiEmbedSavedChartCreateResponse> {
        this.setStatus(200);

        assertEmbeddedAuth(req.account);

        if (projectUuid !== req.account.embed.projectUuid) {
            throw new ForbiddenError(
                'Embed token cannot create charts in this project',
            );
        }

        const { modifiableActions } = req.account.authentication.data;
        const actorUserUuid =
            modifiableActions?.userUuid ??
            modifiableActions?.serviceAccountUserUuid;

        if (!modifiableActions?.spaceUuid || !actorUserUuid) {
            throw new ForbiddenError(
                'Embed token does not allow modifiable actions',
            );
        }

        const userService = this.services.getUserService();
        if (modifiableActions.userUuid === undefined) {
            const serviceAccount =
                await userService.findServiceAccountByUserUuid(actorUserUuid);
            if (
                serviceAccount === undefined ||
                serviceAccount.organizationUuid !==
                    req.account.embed.organization.organizationUuid
            ) {
                throw new ForbiddenError(
                    'Embed token service account is not valid for this organization',
                );
            }
        }

        const actor = await userService.getSessionByUserUuidAndOrg(
            actorUserUuid,
            req.account.embed.organization.organizationUuid,
        );
        if (!actor.isActive) {
            throw new ForbiddenError(
                'Embed token actor is not active for this organization',
            );
        }

        const results = await this.services
            .getSavedChartService()
            .create(actor, projectUuid, {
                ...body,
                dashboardUuid: undefined,
                spaceUuid: modifiableActions.spaceUuid,
            });

        return {
            status: 'ok',
            results,
        };
    }

    @SuccessResponse('200', 'Success')
    @Post('/dashboard/availableFilters')
    @OperationId('getEmbedDashboardFilters')
    async getEmbedDashboardAvailableFilters(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Body() body: SavedChartsInfoForDashboardAvailableFilters,
    ): Promise<ApiEmbedDashboardAvailableFiltersResponse> {
        this.setStatus(200);

        assertEmbeddedAuth(req.account);

        return {
            status: 'ok',
            results:
                await this.getEmbedService().getAvailableFiltersForSavedQueries(
                    projectUuid,
                    req.account,
                    body,
                ),
        };
    }

    @Deprecated()
    @SuccessResponse('200', 'Success')
    @Post('/chart-and-results')
    @OperationId('getEmbedChartResults')
    async getEmbedChartResults(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Body()
        body: {
            tileUuid: string;
            dashboardFilters?: DashboardFilters;
            dateZoomGranularity?: DateGranularity | string;
            dashboardSorts?: SortField[];
            parameters?: ParametersValuesMap;
        },
    ): Promise<ApiEmbedChartAndResultsResponse> {
        this.setStatus(200);

        assertEmbeddedAuth(req.account);

        return {
            status: 'ok',
            results: await this.getEmbedService().getChartAndResults(
                projectUuid,
                req.account,
                body.tileUuid,
                body.dashboardFilters,
                body.dateZoomGranularity,
                body.dashboardSorts,
                body.parameters,
            ),
        };
    }

    @SuccessResponse('200', 'Success')
    @Post('/query/dashboard-tile')
    @OperationId('executeAsyncDashboardTileQuery')
    async executeAsyncDashboardTileQuery(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Body()
        body: {
            tileUuid: string;
            timezone?: string;
        } & Pick<
            ExecuteAsyncDashboardChartRequestParams,
            | 'dashboardFilters'
            | 'dashboardSorts'
            | 'pivotResults'
            | 'invalidateCache'
            | 'dateZoom'
            | 'parameters'
            | 'limit'
        >,
    ): Promise<{
        status: 'ok';
        results: ApiExecuteAsyncDashboardChartQueryResults;
    }> {
        this.setStatus(200);

        assertEmbeddedAuth(req.account);

        const results =
            await this.getEmbedService().executeAsyncDashboardTileQuery({
                account: req.account!,
                projectUuid,
                tileUuid: body.tileUuid,
                dashboardFilters: body.dashboardFilters,
                dateZoom: body.dateZoom,
                invalidateCache: body.invalidateCache,
                dashboardSorts: body.dashboardSorts,
                parameters: body.parameters,
                pivotResults: body.pivotResults,
                limit: body.limit,
                timezone: body.timezone,
            });

        return {
            status: 'ok',
            results,
        };
    }

    @SuccessResponse('200', 'Success')
    @Get('/sql-chart-tile/{tileUuid}')
    @OperationId('getEmbedDashboardSqlChartTile')
    async getEmbedDashboardSqlChartTile(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Path() tileUuid: string,
    ): Promise<ApiSqlChart> {
        this.setStatus(200);

        assertEmbeddedAuth(req.account);

        const results = await this.getEmbedService().getDashboardSqlChartTile({
            account: req.account,
            projectUuid,
            tileUuid,
        });

        return {
            status: 'ok',
            results,
        };
    }

    @SuccessResponse('200', 'Success')
    @Post('/query/dashboard-sql-chart')
    @OperationId('executeAsyncDashboardSqlChartTileQuery')
    async executeAsyncDashboardSqlChartTileQuery(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Body()
        body: {
            tileUuid: string;
        } & Pick<
            ExecuteAsyncDashboardSqlChartRequestParams,
            | 'dashboardFilters'
            | 'dashboardSorts'
            | 'invalidateCache'
            | 'parameters'
            | 'limit'
        >,
    ): Promise<{
        status: 'ok';
        results: ApiExecuteAsyncDashboardSqlChartQueryResults;
    }> {
        this.setStatus(200);

        assertEmbeddedAuth(req.account);

        const results =
            await this.getEmbedService().executeAsyncDashboardSqlChartTileQuery(
                {
                    account: req.account,
                    projectUuid,
                    tileUuid: body.tileUuid,
                    dashboardFilters: body.dashboardFilters,
                    dashboardSorts: body.dashboardSorts,
                    invalidateCache: body.invalidateCache,
                    parameters: body.parameters,
                    limit: body.limit,
                },
            );

        return {
            status: 'ok',
            results,
        };
    }

    /**
     * Calculate totals from an embedded saved chart.
     * @summary Calculate totals for embed saved chart
     * @deprecated Use POST /api/v2/projects/{projectUuid}/query/{queryUuid}/calculate-total instead.
     */
    @Middlewares([
        getDeprecatedRouteMiddleware(new Date('2026-05-29'), {
            suffixMessage:
                'Use POST /api/v2/projects/{projectUuid}/query/{queryUuid}/calculate-total instead.',
        }),
    ])
    @SuccessResponse('200', 'Success')
    @Post('/chart/:savedChartUuid/calculate-total')
    @OperationId('embedCalculateTotalFromSavedChart')
    async embedCalculateTotalFromSavedChart(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Path() savedChartUuid: string,
        @Body()
        body: {
            dashboardFilters?: AnyType; // DashboardFilters; temp disable validation
            parameters?: ParametersValuesMap;
            invalidateCache?: boolean;
        },
    ): Promise<ApiCalculateTotalResponse> {
        this.setStatus(200);

        assertEmbeddedAuth(req.account);

        return {
            status: 'ok',
            results: await this.getEmbedService().calculateTotalFromSavedChart(
                req.account,
                projectUuid,
                savedChartUuid,
                body.dashboardFilters,
                body.parameters,
                body.invalidateCache,
            ),
        };
    }

    /**
     * @deprecated Use POST /api/v2/projects/{projectUuid}/query/{queryUuid}/calculate-total with kind 'columnSubtotal' instead.
     * @summary Calculate subtotals for embed chart
     */
    @Middlewares([
        getDeprecatedRouteMiddleware(new Date('2026-06-04'), {
            suffixMessage:
                "Use POST /api/v2/projects/{projectUuid}/query/{queryUuid}/calculate-total with kind 'columnSubtotal' instead.",
        }),
    ])
    @SuccessResponse('200', 'Success')
    @Post('/chart/:savedChartUuid/calculate-subtotals')
    @OperationId('embedCalculateSubtotalsFromSavedChart')
    async embedCalculateSubtotalsFromSavedChart(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Path() savedChartUuid: string,
        @Body()
        body: {
            dashboardFilters?: DashboardFilters;
            parameters?: ParametersValuesMap;
            columnOrder: string[];
            pivotDimensions?: string[];
            invalidateCache?: boolean;
            dateZoom?: DateZoom;
        },
    ): Promise<ApiCalculateSubtotalsResponse> {
        this.setStatus(200);

        assertEmbeddedAuth(req.account);

        return {
            status: 'ok',
            results:
                await this.getEmbedService().calculateSubtotalsFromSavedChart(
                    req.account,
                    projectUuid,
                    savedChartUuid,
                    body.dashboardFilters,
                    body.parameters,
                    body.columnOrder,
                    body.pivotDimensions,
                    body.invalidateCache,
                    body.dateZoom,
                ),
        };
    }

    /**
     * Calculate totals from a raw metric query in embed context.
     * This is used when exploring data directly (not from a saved chart).
     * @summary Calculate totals for embed query
     * @deprecated Use POST /api/v2/projects/{projectUuid}/query/{queryUuid}/calculate-total instead.
     */
    @Middlewares([
        getDeprecatedRouteMiddleware(new Date('2026-05-29'), {
            suffixMessage:
                'Use POST /api/v2/projects/{projectUuid}/query/{queryUuid}/calculate-total instead.',
        }),
    ])
    @SuccessResponse('200', 'Success')
    @Post('/calculate-total')
    @OperationId('embedCalculateTotalFromQuery')
    async embedCalculateTotalFromQuery(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Body() body: CalculateTotalFromQuery,
    ): Promise<ApiCalculateTotalResponse> {
        this.setStatus(200);

        assertEmbeddedAuth(req.account);

        return {
            status: 'ok',
            results: await this.getEmbedService().calculateTotalFromQuery(
                req.account,
                projectUuid,
                body,
            ),
        };
    }

    /**
     * Calculate subtotals from a raw metric query in embed context.
     * This is used when exploring data directly (not from a saved chart).
     * @deprecated Use POST /api/v2/projects/{projectUuid}/query/{queryUuid}/calculate-total with kind 'columnSubtotal' instead.
     * @summary Calculate subtotals for embed query
     */
    @Middlewares([
        getDeprecatedRouteMiddleware(new Date('2026-06-04'), {
            suffixMessage:
                "Use POST /api/v2/projects/{projectUuid}/query/{queryUuid}/calculate-total with kind 'columnSubtotal' instead.",
        }),
    ])
    @SuccessResponse('200', 'Success')
    @Post('/calculate-subtotals')
    @OperationId('embedCalculateSubtotalsFromQuery')
    async embedCalculateSubtotalsFromQuery(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Body() body: CalculateSubtotalsFromQuery,
    ): Promise<ApiCalculateSubtotalsResponse> {
        this.setStatus(200);

        assertEmbeddedAuth(req.account);

        return {
            status: 'ok',
            results: await this.getEmbedService().calculateSubtotalsFromQuery(
                req.account,
                projectUuid,
                body,
            ),
        };
    }

    @SuccessResponse('200', 'Success')
    @Post('/filter/:filterUuid/search')
    @OperationId('searchFilterValues')
    async searchFilterValues(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Path() filterUuid: string,
        @Body()
        body: {
            search: string;
            limit: number;
            filters: AndFilterGroup | undefined;
            forceRefresh: boolean;
            tableName?: string;
            fieldId?: string;
            timezone?: string;
        },
    ): Promise<{
        status: 'ok';
        results: FieldValueSearchResult;
    }> {
        this.setStatus(200);
        const {
            search,
            limit,
            filters,
            forceRefresh,
            tableName,
            fieldId,
            timezone,
        } = body;

        assertEmbeddedAuth(req.account);

        const results = await this.getEmbedService().searchFilterValues({
            account: req.account,
            projectUuid,
            filterUuid,
            search,
            limit,
            filters,
            forceRefresh,
            tableName,
            fieldId,
            timezone,
        });
        return {
            status: 'ok',
            results,
        };
    }

    /**
     * Synthesized user info for the embed JWT. Used by data app tiles to
     * answer the SDK's `client.auth.getUser()` call without ever forwarding
     * a request to the session-only `/api/v1/user` endpoint.
     * @summary Get embed user info
     */
    @SuccessResponse('200', 'Success')
    @Get('/user-info')
    @OperationId('getEmbedUserInfo')
    async getEmbedUserInfo(
        @Request() req: express.Request,
        @Path() projectUuid: string,
    ): Promise<{
        status: 'ok';
        results: {
            userUuid: string;
            firstName: string;
            lastName: string;
            email: string;
            role: string;
            organizationUuid: string;
            userAttributes: Record<string, string>;
        };
    }> {
        this.setStatus(200);
        assertEmbeddedAuth(req.account);
        const { account } = req;

        // Path projectUuid is authoritative on the URL but the JWT is the
        // trust source — fail loudly on mismatch instead of silently serving
        // the JWT's project.
        if (projectUuid !== account.embed.projectUuid) {
            throw new ForbiddenError(
                'Project mismatch between URL and embed token',
            );
        }

        // SDK's `getUser()` expects flat `string` values per attribute. The
        // embed attribute store is `string[]` (an attribute can have multiple
        // values). Take the first — the same compromise as how the embed
        // explore filter consumes these today.
        const userAttributes = Object.fromEntries(
            Object.entries(account.access.controls?.userAttributes ?? {}).map(
                ([key, values]) => [key, values[0] ?? ''],
            ),
        );

        return {
            status: 'ok',
            results: {
                userUuid: account.user.id,
                firstName: '',
                lastName: '',
                email: account.user.email ?? '',
                role: 'embed',
                organizationUuid:
                    account.embed.organization.organizationUuid ?? '',
                userAttributes,
            },
        };
    }

    /**
     * Resolve the latest ready version of a data app and mint a short-lived
     * preview token for it. The token authorizes the iframe to load the
     * built app bundle from `/api/apps/{appUuid}/versions/{version}/`.
     * The app must be referenced by a tile on a dashboard in the embed's
     * allowlist (or `allowAllDashboards` must be set).
     * @summary Get embed data app preview token
     */
    @SuccessResponse('200', 'Success')
    @Get('/apps/{appUuid}/preview-token')
    @OperationId('getEmbedAppPreviewToken')
    async getEmbedAppPreviewToken(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Path() appUuid: string,
    ): Promise<{
        status: 'ok';
        results: { token: string; version: number };
    }> {
        this.setStatus(200);
        assertEmbeddedAuth(req.account);

        if (projectUuid !== req.account.embed.projectUuid) {
            throw new ForbiddenError(
                'Project mismatch between URL and embed token',
            );
        }

        const results = await this.services
            .getAppGenerateService<AppGenerateService>()
            .getEmbedAppPreviewToken(req.account, appUuid);

        return {
            status: 'ok',
            results,
        };
    }

    /**
     * Convenience method to access the embedding service without having
     * to specify an interface type.
     */
    protected getEmbedService() {
        return this.services.getEmbedService<EmbedService>();
    }
}
