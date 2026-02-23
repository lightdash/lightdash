import {
    ApiErrorPayload,
    type ApiGetPreAggregateStatsResponse,
} from '@lightdash/common';
import {
    Get,
    Middlewares,
    OperationId,
    Path,
    Query,
    Request,
    Response,
    Route,
    SuccessResponse,
    Tags,
} from '@tsoa/runtime';
import express from 'express';
import { allowApiKeyAuthentication, isAuthenticated } from '../authentication';
import { BaseController } from '../baseController';

@Route('/api/v2/projects/{projectUuid}/pre-aggregate-stats')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('v2', 'Pre-Aggregates')
export class PreAggregateStatsController extends BaseController {
    /**
     * Retrieves aggregated pre-aggregate hit/miss statistics for a project
     * @summary Get pre-aggregate stats
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/')
    @OperationId('getPreAggregateStats')
    async getPreAggregateStats(
        @Path() projectUuid: string,
        @Request() req: express.Request,
        @Query() days?: number,
        @Query() page?: number,
        @Query() pageSize?: number,
        @Query() exploreName?: string,
        @Query() queryType?: 'chart' | 'dashboard' | 'explorer',
    ): Promise<ApiGetPreAggregateStatsResponse> {
        this.setStatus(200);

        const paginateArgs = page && pageSize ? { page, pageSize } : undefined;

        const filters =
            exploreName || queryType ? { exploreName, queryType } : undefined;

        const results = await this.services
            .getAsyncQueryService()
            .getPreAggregateStats(
                req.account!,
                projectUuid,
                days ?? 3,
                paginateArgs,
                filters,
            );

        return {
            status: 'ok',
            results,
        };
    }
}
