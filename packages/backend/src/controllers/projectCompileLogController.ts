import {
    ApiErrorPayload,
    KnexPaginateArgs,
    type ApiProjectCompileLogResponse,
    type ApiProjectCompileLogsResponse,
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
import { allowApiKeyAuthentication, isAuthenticated } from './authentication';
import { BaseController } from './baseController';

@Route('/api/v1/projects/{projectUuid}/compile-logs')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('Projects')
export class ProjectCompileLogController extends BaseController {
    /**
     * Get compilation logs for a project
     * @param projectUuid
     * @param pageSize number of items per page
     * @param page number of page
     * @param sortBy column to sort by
     * @param sortDirection sort direction (asc or desc)
     * @param triggeredByUserUuids filter by triggered user UUIDs (comma-separated)
     * @param source filter by source ("cli_deploy", "refresh_dbt")
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get()
    @OperationId('getProjectCompileLogs')
    async getProjectCompileLogs(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Query() pageSize?: number,
        @Query() page?: number,
        @Query() sortBy?: 'created_at' | 'compilation_source',
        @Query() sortDirection?: 'asc' | 'desc',
        @Query() triggeredByUserUuids?: string,
        @Query() source?: 'cli_deploy' | 'refresh_dbt' | 'create_project',
    ): Promise<ApiProjectCompileLogsResponse> {
        this.setStatus(200);

        let paginateArgs: KnexPaginateArgs | undefined;
        if (pageSize && page) {
            paginateArgs = {
                page,
                pageSize,
            };
        }
        const sort = sortBy
            ? { column: sortBy, direction: sortDirection || 'desc' }
            : undefined;
        const filter = {
            triggeredByUserUuids: triggeredByUserUuids
                ? triggeredByUserUuids.split(',')
                : undefined,
            source,
        };

        return {
            status: 'ok',
            results: await this.services
                .getProjectCompileLogService()
                .getProjectCompileLogs(
                    req.user!,
                    projectUuid,
                    paginateArgs,
                    sort,
                    filter,
                ),
        };
    }

    /**
     * Get compilation log by job UUID
     * @summary Get compilation log for a specific job
     * @param req express request
     * @param projectUuid The uuid of the project
     * @param jobUuid The uuid of the job
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('job/{jobUuid}')
    @OperationId('getProjectCompileLogByJob')
    async getProjectCompileLogByJob(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Path() jobUuid: string,
    ): Promise<ApiProjectCompileLogResponse> {
        this.setStatus(200);

        return {
            status: 'ok',
            results: {
                log: await this.services
                    .getProjectCompileLogService()
                    .getProjectCompileLogByJob(req.user!, projectUuid, jobUuid),
            },
        };
    }
}
