import {
    assertRegisteredAccount,
    SchedulerRunStatus,
    type ApiDashboardPaginatedSchedulersResponse,
    type ApiErrorPayload,
    type ApiJobScheduledResponse,
    type ApiSchedulerRunsResponse,
    type ExportContentRequest,
    type KnexPaginateArgs,
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
import { toSessionUser } from '../../auth/account';
import { requireOAuthScopeOperation } from '../../auth/oauthScopes/unchecked';
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

@Route('/api/v2/dashboards/{dashboardUuid}')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('v2', 'Dashboards')
export class DashboardControllerV2 extends BaseController {
    /**
     * Export dashboard content as an image, PDF, CSV or XLSX. Schedules a job;
     * poll `GET /api/v1/schedulers/job/{jobId}/status` until it is `completed`,
     * then download the file from `details.url`.
     *
     * Embed tokens can call this with the `Lightdash-Embed-Token` header and a
     * `projectUuid` query param. The export uses the viewer's access, filters,
     * parameters, date zoom and tabs. Each format needs an embed permission:
     * - `image`: `canExportImages` or `view:EmbedImageExport`
     * - `pdf`: `canExportPagePdf` or `view:EmbedPagePdfExport`
     * - `csv` / `xlsx`: `canExportDashboardCsv` or `view:EmbedDashboardCsvExport`
     *
     * Poll the job status with the same token. The file URL is a signed link
     * that expires.
     * @summary Export dashboard content
     * @param dashboardUuid The uuid of the dashboard
     * @param req express request
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        requireOAuthScopeOperation(
            'DashboardControllerV2.exportDashboardContent',
        ),
    ])
    @SuccessResponse('200', 'Success')
    @Post('/exports')
    @OperationId('exportDashboardContentV2')
    async exportDashboardContent(
        @Path() dashboardUuid: string,
        @Body() body: ExportContentRequest,
        @Request() req: express.Request,
    ): Promise<ApiJobScheduledResponse> {
        this.setStatus(200);

        return {
            status: 'ok',
            results: await this.services
                .getDashboardService()
                .scheduleExportContent(req.account!, dashboardUuid, body),
        };
    }

    /**
     * Get all schedulers for a dashboard
     * @summary List dashboard schedulers
     * @param dashboardUuid The uuid of the dashboard
     * @param req express request
     * @param pageSize number of items per page
     * @param page page number
     * @param searchQuery filter schedulers by name
     * @param includeLatestRun include the most recent run for each scheduler
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        requireOAuthScopeOperation(
            'DashboardControllerV2.getDashboardSchedulers',
        ),
    ])
    @SuccessResponse('200', 'Success')
    @Get('/schedulers')
    @OperationId('getDashboardSchedulers')
    async getDashboardSchedulers(
        @Path() dashboardUuid: string,
        @Request() req: express.Request,
        @Query() pageSize?: number,
        @Query() page?: number,
        @Query() searchQuery?: string,
        @Query() includeLatestRun?: boolean,
    ): Promise<ApiDashboardPaginatedSchedulersResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);

        let paginateArgs: KnexPaginateArgs | undefined;
        if (pageSize && page) {
            paginateArgs = {
                page,
                pageSize,
            };
        }

        return {
            status: 'ok',
            results: await this.services
                .getDashboardService()
                .getSchedulers(
                    toSessionUser(req.account),
                    dashboardUuid,
                    searchQuery,
                    paginateArgs,
                    includeLatestRun,
                ),
        };
    }

    /**
     * Get the run history of a single scheduler on a dashboard
     * @summary List dashboard scheduler runs
     * @param dashboardUuid The uuid of the dashboard
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
    @OperationId('getDashboardSchedulerRuns')
    async getDashboardSchedulerRuns(
        @Path() dashboardUuid: string,
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
                .getDashboardService()
                .getSchedulerRuns(
                    toSessionUser(req.account),
                    dashboardUuid,
                    schedulerUuid,
                    paginateArgs,
                    searchQuery,
                    sort,
                    filters,
                ),
        };
    }
}
