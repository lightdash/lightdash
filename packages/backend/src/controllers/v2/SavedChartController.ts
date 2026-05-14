import {
    assertRegisteredAccount,
    SchedulerRunStatus,
    type ApiErrorPayload,
    type ApiSavedChartPaginatedSchedulersResponse,
    type ApiSchedulerRunsResponse,
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
import { toSessionUser } from '../../auth/account';
import {
    parseEnumList,
    parseWhitelistedList,
} from '../../utils/inputValidation';
import {
    allowApiKeyAuthentication,
    isAuthenticated,
} from '../authentication/middlewares';
import { BaseController } from '../baseController';
import { VALID_SCHEDULER_RUN_DESTINATIONS } from '../schedulerConstants';

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
     * @param searchQuery filter schedulers by name
     * @param formats comma-separated list of scheduler formats to include
     * @param includeLatestRun include the most recent run for each scheduler
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
        @Query() includeLatestRun?: boolean,
    ): Promise<ApiSavedChartPaginatedSchedulersResponse> {
        assertRegisteredAccount(req.account);
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
                    toSessionUser(req.account),
                    chartUuid,
                    searchQuery,
                    paginateArgs,
                    filters,
                    includeLatestRun,
                ),
        };
    }

    /**
     * Get the run history of a single scheduler on a chart
     * @summary List chart scheduler runs
     * @param chartUuid The uuid of the chart
     * @param schedulerUuid The uuid of the scheduler
     * @param req express request
     * @param pageSize number of items per page
     * @param page page number
     * @param searchQuery filter runs by scheduler name
     * @param sortBy column to sort by (scheduledTime, createdAt)
     * @param sortDirection sort direction (asc or desc)
     * @param statuses comma-separated list of run statuses to include
     * @param destinations comma-separated list of destination types to include
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/schedulers/{schedulerUuid}/runs')
    @OperationId('getSavedChartSchedulerRuns')
    async getSavedChartSchedulerRuns(
        @Path() chartUuid: string,
        @Path() schedulerUuid: string,
        @Request() req: express.Request,
        @Query() pageSize?: number,
        @Query() page?: number,
        @Query() searchQuery?: string,
        @Query() sortBy?: 'scheduledTime' | 'createdAt',
        @Query() sortDirection?: 'asc' | 'desc',
        @Query() statuses?: string,
        @Query() destinations?: string,
    ): Promise<ApiSchedulerRunsResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);

        let paginateArgs: KnexPaginateArgs | undefined;
        if (pageSize && page) {
            paginateArgs = { page, pageSize };
        }
        const sort =
            sortBy && sortDirection
                ? { column: sortBy, direction: sortDirection }
                : undefined;
        const filters = {
            statuses: parseEnumList(statuses, SchedulerRunStatus, 'statuses'),
            destinations: parseWhitelistedList(
                destinations,
                VALID_SCHEDULER_RUN_DESTINATIONS,
                'destinations',
            ),
        };

        return {
            status: 'ok',
            results: await this.services
                .getSavedChartService()
                .getSchedulerRuns(
                    toSessionUser(req.account),
                    chartUuid,
                    schedulerUuid,
                    paginateArgs,
                    searchQuery,
                    sort,
                    filters,
                ),
        };
    }
}
