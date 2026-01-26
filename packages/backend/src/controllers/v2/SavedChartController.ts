import {
    AuthorizationError,
    type ApiErrorPayload,
    type ApiSavedChartPaginatedSchedulersResponse,
    type KnexPaginateArgs,
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
import {
    allowApiKeyAuthentication,
    isAuthenticated,
} from '../authentication/middlewares';
import { BaseController } from '../baseController';

@Route('/api/v2/saved/{chartUuid}')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('v2', 'Charts')
export class SavedChartControllerV2 extends BaseController {
    /**
     * Get all schedulers for a saved chart
     * @summary List chart schedulers
     * @param chartUuid The uuid of the chart
     * @param req express request
     * @param pageSize number of items per page
     * @param page page number
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/schedulers')
    @OperationId('getSavedChartSchedulers')
    async getSavedChartSchedulers(
        @Path() chartUuid: string,
        @Request() req: express.Request,
        @Query() pageSize?: number,
        @Query() page?: number,
        @Query() searchQuery?: string,
        @Query() formats?: string,
    ): Promise<ApiSavedChartPaginatedSchedulersResponse> {
        if (!req.user) {
            throw new AuthorizationError('User session not found');
        }

        this.setStatus(200);

        let paginateArgs: KnexPaginateArgs | undefined;
        if (pageSize && page) {
            paginateArgs = {
                page,
                pageSize,
            };
        }

        const filters = {
            formats: formats ? formats.split(',') : undefined,
        };

        return {
            status: 'ok',
            results: await this.services
                .getSavedChartService()
                .getSchedulers(
                    req.user,
                    chartUuid,
                    searchQuery,
                    paginateArgs,
                    filters,
                ),
        };
    }
}
