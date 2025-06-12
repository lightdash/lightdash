import {
    AnyType,
    ApiCompiledQueryResults,
    ApiErrorPayload,
    ApiExploreResults,
    ApiExploresResults,
    ApiSuccessEmpty,
    MetricQuery,
    PivotConfig,
} from '@lightdash/common';
import {
    Body,
    Get,
    Middlewares,
    OperationId,
    Path,
    Post,
    Put,
    Request,
    Response,
    Route,
    SuccessResponse,
    Tags,
} from '@tsoa/runtime';
import express from 'express';
import { deprecatedDownloadCsvRoute } from '../middlewares/deprecation';
import {
    allowApiKeyAuthentication,
    isAuthenticated,
    unauthorisedInDemo,
} from './authentication';
import { BaseController } from './baseController';

@Route('/api/v1/projects/{projectUuid}/explores')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('Projects')
export class ExploreController extends BaseController {
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Put('/')
    @OperationId('SetExplores')
    async SetExplores(
        @Path() projectUuid: string,
        @Request() req: express.Request,
        @Body() body: AnyType[], // tsoa doesn't seem to work with explores from CLI
    ): Promise<ApiSuccessEmpty> {
        this.setStatus(200);
        await this.services
            .getProjectService()
            .setExplores(req.user!, projectUuid, body);

        return {
            status: 'ok',
            results: undefined,
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/')
    @OperationId('GetExplores')
    async GetExplores(
        @Path() projectUuid: string,
        @Request() req: express.Request,
    ): Promise<{ status: 'ok'; results: ApiExploresResults }> {
        this.setStatus(200);
        const results: ApiExploresResults = await this.services
            .getProjectService()
            .getAllExploresSummary(
                req.user!,
                projectUuid,
                req.query.filtered === 'true',
            );

        return {
            status: 'ok',
            results,
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('{exploreId}')
    @OperationId('GetExplore')
    async GetExplore(
        @Path() exploreId: string,

        @Path() projectUuid: string,
        @Request() req: express.Request,
    ): Promise<{ status: 'ok'; results: ApiExploreResults }> {
        this.setStatus(200);
        const results = await this.services
            .getProjectService()
            .getExplore(req.user!, projectUuid, exploreId, undefined, false);

        return {
            status: 'ok',
            results,
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('{exploreId}/compileQuery')
    @OperationId('CompileQuery')
    async CompileQuery(
        @Path() exploreId: string,
        @Path() projectUuid: string,
        @Request() req: express.Request,
        @Body() body: MetricQuery,
    ): Promise<{ status: 'ok'; results: ApiCompiledQueryResults }> {
        this.setStatus(200);

        const results = (
            await this.services.getProjectService().compileQuery({
                user: req.user!,
                metricQuery: body,
                projectUuid,
                exploreName: exploreId,
            })
        ).query;

        return {
            status: 'ok',
            results,
        };
    }

    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        deprecatedDownloadCsvRoute,
    ])
    @SuccessResponse('200', 'Success')
    @Post('{exploreId}/downloadCsv')
    @OperationId('DownloadCsvFromExplore')
    async DownloadCsvFromExplore(
        @Path() exploreId: string,
        @Path() projectUuid: string,
        @Request() req: express.Request,
        @Body()
        body: MetricQuery & {
            onlyRaw: boolean;
            csvLimit: number | null | undefined;
            showTableNames: boolean;
            customLabels?: { [key: string]: string };
            columnOrder: string[];
            hiddenFields?: string[];
            chartName?: string;
            pivotConfig?: PivotConfig;
        },
    ): Promise<{ status: 'ok'; results: { jobId: string } }> {
        this.setStatus(200);
        const {
            onlyRaw,
            csvLimit,
            showTableNames,
            customLabels,
            columnOrder,
            hiddenFields,
            pivotConfig,
        } = body;
        const metricQuery: MetricQuery = {
            exploreName: body.exploreName,
            dimensions: body.dimensions,
            metrics: body.metrics,
            filters: body.filters,
            sorts: body.sorts,
            limit: body.limit,
            tableCalculations: body.tableCalculations,
            additionalMetrics: body.additionalMetrics,
            customDimensions: body.customDimensions,
            metricOverrides: body.metricOverrides,
        };

        const { jobId } = await req.services
            .getCsvService()
            .scheduleDownloadCsv(req.user!, {
                userUuid: req.user?.userUuid!,
                projectUuid,
                exploreId,
                metricQuery,
                onlyRaw,
                csvLimit,
                showTableNames,
                customLabels,
                chartName: body.chartName,
                fromSavedChart: false,
                columnOrder,
                hiddenFields,
                pivotConfig,
            });

        return {
            status: 'ok',
            results: {
                jobId,
            },
        };
    }
}
