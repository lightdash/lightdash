import {
    AdditionalMetric,
    AndFilterGroup,
    AnyType,
    ApiCalculateTotalResponse,
    ApiErrorPayload,
    ApiSuccessEmpty,
    assertEmbeddedAuth,
    CacheMetadata,
    CreateEmbed,
    CreateEmbedJwt,
    Dashboard,
    DashboardAvailableFilters,
    DashboardFilters,
    DateGranularity,
    DecodedEmbed,
    EmbedUrl,
    Explore,
    FieldValueSearchResult,
    Item,
    MetricQueryResponse,
    SavedChart,
    SavedChartsInfoForDashboardAvailableFilters,
    SortField,
    UpdateEmbed,
} from '@lightdash/common';
import {
    Body,
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
    isAuthenticated,
} from '../../controllers/authentication';
import { BaseController } from '../../controllers/baseController';
import { EmbedService } from '../services/EmbedService/EmbedService';

export type ApiEmbedDashboardResponse = {
    status: 'ok';
    results: Dashboard & {
        // declare type as TSOA doesn't understand zod type InteractivityOptions
        dashboardFiltersInteractivity?: CreateEmbedJwt['content']['dashboardFiltersInteractivity'];
        canExportCsv?: boolean;
        canExportImages?: boolean;
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
        return {
            status: 'ok',
            results: await this.getEmbedService().getConfig(
                req.user!,
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
        @Body() body: CreateEmbed,
    ): Promise<ApiEmbedConfigResponse> {
        this.setStatus(201);
        return {
            status: 'ok',
            results: await this.getEmbedService().saveConfig(
                req.user!,
                projectUuid,
                body,
            ),
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Patch('/config/dashboards')
    @OperationId('updateEmbeddedDashboards')
    async updateEmbeddedDashboards(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Body() body: UpdateEmbed,
    ): Promise<ApiSuccessEmpty> {
        this.setStatus(200);
        await this.getEmbedService().updateDashboards(
            req.user!,
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
        return {
            status: 'ok',
            results: await this.getEmbedService().getEmbedUrl(
                req.user!,
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
    ): Promise<ApiEmbedDashboardResponse> {
        this.setStatus(200);

        assertEmbeddedAuth(req.account);

        return {
            status: 'ok',
            results: await this.getEmbedService().getDashboard(
                projectUuid,
                req.account,
            ),
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
            dateZoomGranularity?: DateGranularity;
            dashboardSorts?: SortField[];
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
            ),
        };
    }

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
                body.invalidateCache,
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
        },
    ): Promise<{
        status: 'ok';
        results: FieldValueSearchResult;
    }> {
        this.setStatus(200);
        const { search, limit, filters, forceRefresh } = body;

        assertEmbeddedAuth(req.account);

        const results = await this.getEmbedService().searchFilterValues({
            account: req.account,
            projectUuid,
            filterUuid,
            search,
            limit,
            filters,
            forceRefresh,
        });
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
