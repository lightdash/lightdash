import {
    ApiErrorPayload,
    ApiResponse,
    FiltersResponse,
} from '@lightdash/common';
import { Body, Get, Post } from '@tsoa/runtime';
import express from 'express';
import {
    Controller,
    Middlewares,
    OperationId,
    Path,
    Request,
    Response,
    Route,
    SuccessResponse,
    Tags,
} from 'tsoa';
import chartData from '../mock/chart2.json';

import { projectService } from '../services/services';
import { allowApiKeyAuthentication, isAuthenticated } from './authentication';
import { ApiRunQueryResponse } from './runQueryController';

let cache = {};

@Route('/api/v1/saved/{chartUuid}')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('Charts')
export class SavedChartController extends Controller {
    /**
     * Run a query for a chart
     * @param chartUuid chartUuid for the chart to run
     * @param filters dashboard filters
     * @param req express request
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/results')
    @OperationId('postChartResults')
    async postDashboardTile(
        @Body() body: { filters?: FiltersResponse; refresh?: boolean },
        @Path() chartUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiRunQueryResponse> {
        this.setStatus(200);

        console.log('cache request', { cache });

        if (chartUuid in cache) {
            console.log('--------------------- cache hit');

            return {
                status: 'ok',
                // @ts-expect-error
                results: cache[chartUuid],
            };
        }

        const results = await projectService.runViewChartQuery(
            req.user!,
            chartUuid,
            body.filters,
        );
        // @ts-expect-error
        cache[chartUuid] = results;
        console.log('cache after ->', { cache });

        return {
            status: 'ok',
            results,
        };
    }
}

@Route('/api/v1/chartCache')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('Charts')
export class ChartCacheController extends Controller {
    /**
     * Run a query for a chart
     * @param chartUuid chartUuid for the chart to run
     * @param filters dashboard filters
     * @param req express request
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/clear')
    async postClearCache(
        @Request() req: express.Request,
    ): Promise<ApiResponse> {
        this.setStatus(200);

        console.log('>>>>>>>>>>> clear');

        cache = {};

        return {
            status: 'ok',
            results: undefined,
        };
    }
}
