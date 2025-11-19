import {
    AnyType,
    ApiErrorPayload,
    ApiJobStatusResponse,
    ApiScheduledJobsResponse,
    ApiSchedulerAndTargetsResponse,
    ApiSchedulerLogsResponse,
    ApiSchedulerRunLogsResponse,
    ApiSchedulerRunsResponse,
    ApiSchedulersResponse,
    ApiTestSchedulerResponse,
    KnexPaginateArgs,
    ParameterError,
    SchedulerFormat,
    SchedulerJobStatus,
    SchedulerRunStatus,
} from '@lightdash/common';
import {
    Body,
    Delete,
    Get,
    Middlewares,
    OperationId,
    Patch,
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
import {
    parseEnumList,
    parseUuidList,
    parseWhitelistedList,
} from '../utils/inputValidation';
import {
    allowApiKeyAuthentication,
    isAuthenticated,
    unauthorisedInDemo,
} from './authentication';
import { BaseController } from './baseController';

// Valid destination types (whitelist for parseWhitelistedList)
const VALID_DESTINATIONS = ['email', 'slack', 'msteams', 'gsheets'] as const;

@Route('/api/v1/schedulers')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('Schedulers')
export class SchedulerController extends BaseController {
    /**
     * Get scheduled logs
     * @param req express request
     * @param projectUuid The uuid of the project
     * @param pageSize number of items per page
     * @param page page number
     * @param searchQuery search query to filter logs by scheduler name
     * @param statuses filter by log statuses (comma-separated)
     * @param createdByUserUuids filter by creator user UUIDs (comma-separated)
     * @param destinations filter by destination types (comma-separated: email, slack, msteams)
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/{projectUuid}/logs')
    @OperationId('getSchedulerLogs')
    async getLogs(
        @Path() projectUuid: string,
        @Request() req: express.Request,
        @Query() pageSize?: number,
        @Query() page?: number,
        @Query() searchQuery?: string,
        @Query() statuses?: string,
        @Query() createdByUserUuids?: string,
        @Query() destinations?: string,
    ): Promise<ApiSchedulerLogsResponse> {
        this.setStatus(200);

        let paginateArgs: KnexPaginateArgs | undefined;
        if (pageSize && page) {
            paginateArgs = {
                page,
                pageSize,
            };
        }

        const filters = {
            statuses: statuses
                ? (statuses.split(',') as SchedulerJobStatus[])
                : undefined,
            createdByUserUuids: createdByUserUuids
                ? createdByUserUuids.split(',')
                : undefined,
            destinations: destinations ? destinations.split(',') : undefined,
        };

        return {
            status: 'ok',
            results: await this.services
                .getSchedulerService()
                .getSchedulerLogs(
                    req.user!,
                    projectUuid,
                    paginateArgs,
                    searchQuery,
                    filters,
                ),
        };
    }

    /**
     * Get paginated scheduler runs with aggregated child job counts
     * @summary List scheduler runs
     * @param req express request
     * @param projectUuid The uuid of the project
     * @param pageSize number of items per page
     * @param page page number
     * @param searchQuery search query to filter runs by scheduler name
     * @param sortBy column to sort by (scheduledTime, createdAt)
     * @param sortDirection sort direction (asc or desc)
     * @param schedulerUuids filter by specific scheduler UUIDs (comma-separated)
     * @param statuses filter by run statuses (comma-separated: completed, partial_failure, failed, running, scheduled)
     * @param createdByUserUuids filter by creator user UUIDs (comma-separated)
     * @param destinations filter by destination types (comma-separated: email, slack, msteams)
     * @param resourceType filter by resource type (chart or dashboard)
     * @param resourceUuids filter by resource UUIDs (comma-separated)
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/{projectUuid}/runs')
    @OperationId('getSchedulerRuns')
    async getRuns(
        @Path() projectUuid: string,
        @Request() req: express.Request,
        @Query() pageSize?: number,
        @Query() page?: number,
        @Query() searchQuery?: string,
        @Query() sortBy?: 'scheduledTime' | 'createdAt',
        @Query() sortDirection?: 'asc' | 'desc',
        @Query() schedulerUuids?: string,
        @Query() statuses?: string,
        @Query() createdByUserUuids?: string,
        @Query() destinations?: string,
        @Query() resourceType?: 'chart' | 'dashboard',
        @Query() resourceUuids?: string,
    ): Promise<ApiSchedulerRunsResponse> {
        this.setStatus(200);

        let paginateArgs: KnexPaginateArgs | undefined;
        if (pageSize && page) {
            paginateArgs = {
                page,
                pageSize,
            };
        }

        const sort =
            sortBy && sortDirection
                ? { column: sortBy, direction: sortDirection }
                : undefined;

        const filters = {
            schedulerUuids: parseUuidList(schedulerUuids, 'schedulerUuids'),
            statuses: parseEnumList(statuses, SchedulerRunStatus, 'statuses'),
            createdByUserUuids: parseUuidList(
                createdByUserUuids,
                'createdByUserUuids',
            ),
            destinations: parseWhitelistedList(
                destinations,
                VALID_DESTINATIONS,
                'destinations',
            ),
            resourceType,
            resourceUuids: parseUuidList(resourceUuids, 'resourceUuids'),
        };

        return {
            status: 'ok',
            results: await this.services
                .getSchedulerService()
                .getSchedulerRuns(
                    req.user!,
                    projectUuid,
                    paginateArgs,
                    searchQuery,
                    sort,
                    filters,
                ),
        };
    }

    /**
     * Get detailed logs for a specific scheduler run
     * @summary Get run logs
     * @param req express request
     * @param runId The ID of the run (parent job ID)
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/runs/{runId}/logs')
    @OperationId('getRunLogs')
    async getRunLogs(
        @Path() runId: string,
        @Request() req: express.Request,
    ): Promise<ApiSchedulerRunLogsResponse> {
        this.setStatus(200);

        return {
            status: 'ok',
            results: await this.services
                .getSchedulerService()
                .getRunLogs(req.user!, runId),
        };
    }

    /**
     * List all schedulers with pagination, search, sorting, and filtering
     * @param req express request
     * @param projectUuid
     * @param pageSize number of items per page
     * @param page page number
     * @param searchQuery search query to filter schedulers by name
     * @param sortBy column to sort by
     * @param sortDirection sort direction (asc or desc)
     * @param createdByUserUuids filter by creator user UUIDs (comma-separated)
     * @param formats filter by scheduler formats (comma-separated)
     * @param resourceType filter by resource type (chart or dashboard)
     * @param resourceUuids filter by resource UUIDs (comma-separated)
     * @param destinations filter by destination types (comma-separated: email, slack, msteams)
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/{projectUuid}/list')
    @OperationId('ListSchedulers')
    async getSchedulers(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Query() pageSize?: number,
        @Query() page?: number,
        @Query() searchQuery?: string,
        @Query() sortBy?: 'name' | 'createdAt',
        @Query() sortDirection?: 'asc' | 'desc',
        @Query() createdByUserUuids?: string,
        @Query() formats?: string,
        @Query() resourceType?: 'chart' | 'dashboard',
        @Query() resourceUuids?: string,
        @Query() destinations?: string,
        @Query() includeLatestRun?: boolean,
    ): Promise<ApiSchedulersResponse> {
        this.setStatus(200);
        let paginateArgs: KnexPaginateArgs | undefined;

        if (pageSize && page) {
            paginateArgs = {
                page,
                pageSize,
            };
        }

        let sort: { column: string; direction: 'asc' | 'desc' } | undefined;
        if (sortBy && sortDirection) {
            sort = {
                column: sortBy,
                direction: sortDirection,
            };
        }

        const filters = {
            createdByUserUuids: createdByUserUuids
                ? createdByUserUuids.split(',')
                : undefined,
            formats: formats ? formats.split(',') : undefined,
            resourceType,
            resourceUuids: resourceUuids ? resourceUuids.split(',') : undefined,
            destinations: destinations ? destinations.split(',') : undefined,
        };

        return {
            status: 'ok',
            results: await this.services
                .getSchedulerService()
                .getSchedulers(
                    req.user!,
                    projectUuid,
                    paginateArgs,
                    searchQuery,
                    sort,
                    filters,
                    includeLatestRun,
                ),
        };
    }

    /**
     * Get a scheduler
     * @param schedulerUuid The uuid of the scheduler to update
     * @param req express request
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('{schedulerUuid}')
    @OperationId('getScheduler')
    async get(
        @Path() schedulerUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiSchedulerAndTargetsResponse> {
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getSchedulerService()
                .getScheduler(req.user!, schedulerUuid),
        };
    }

    /**
     * Update a scheduler
     * @param schedulerUuid The uuid of the scheduler to update
     * @param req express request
     * @param body the new scheduler data
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('201', 'Updated')
    @Patch('{schedulerUuid}')
    @OperationId('updateScheduler')
    async patch(
        @Path() schedulerUuid: string,
        @Request() req: express.Request,
        @Body() body: AnyType, // TODO: It should be UpdateSchedulerAndTargetsWithoutId but tsoa returns an error
    ): Promise<ApiSchedulerAndTargetsResponse> {
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getSchedulerService()
                .updateScheduler(req.user!, schedulerUuid, body),
        };
    }

    /**
     * Set scheduler enabled
     * @param schedulerUuid The uuid of the scheduler to update
     * @param req express request
     * @param body the enabled flag
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('201', 'Updated')
    @Patch('{schedulerUuid}/enabled')
    @OperationId('updateSchedulerEnabled')
    async patchEnabled(
        @Path() schedulerUuid: string,
        @Request() req: express.Request,
        @Body() body: { enabled: boolean },
    ): Promise<ApiSchedulerAndTargetsResponse> {
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getSchedulerService()
                .setSchedulerEnabled(req.user!, schedulerUuid, body.enabled),
        };
    }

    /**
     * Delete a scheduler
     * @param schedulerUuid The uuid of the scheduler to delete
     * @param req express request
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('201', 'Deleted')
    @Delete('{schedulerUuid}')
    @OperationId('deleteScheduler')
    async delete(
        @Path() schedulerUuid: string,
        @Request() req: express.Request,
    ): Promise<{
        status: 'ok';
        results: undefined;
    }> {
        this.setStatus(200);
        await this.services
            .getSchedulerService()
            .deleteScheduler(req.user!, schedulerUuid);
        return {
            status: 'ok',
            results: undefined,
        };
    }

    /**
     * Get scheduled jobs
     * @param schedulerUuid The uuid of the scheduler to update
     * @param req express request
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('{schedulerUuid}/jobs')
    @OperationId('getScheduledJobs')
    async getJobs(
        @Path() schedulerUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiScheduledJobsResponse> {
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getSchedulerService()
                .getScheduledJobs(req.user!, schedulerUuid),
        };
    }

    /**
     * Get a generic job status
     * This method can be used when polling from the frontend
     * @param jobId the jobId for the status to check
     * @param req express request
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('job/{jobId}/status')
    @OperationId('getSchedulerJobStatus')
    async getSchedulerStatus(
        @Path() jobId: string,
        @Request() req: express.Request,
    ): Promise<ApiJobStatusResponse> {
        this.setStatus(200);
        const { status, details } = await this.services
            .getSchedulerService()
            .getJobStatus(req.account!, jobId);
        return {
            status: 'ok',
            results: {
                status: status as SchedulerJobStatus,
                details,
            },
        };
    }

    /**
     * Send a scheduler now before saving it
     * @param req express request
     * @param body the create scheduler data
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Post('send')
    @OperationId('sendScheduler')
    async post(
        @Request() req: express.Request,
        @Body() body: AnyType, // TODO: It should be CreateSchedulerAndTargets but tsoa returns an error
    ): Promise<ApiTestSchedulerResponse> {
        this.setStatus(200);

        return {
            status: 'ok',
            results: {
                jobId: (
                    await this.services
                        .getSchedulerService()
                        .sendScheduler(req.user!, body)
                ).jobId,
            },
        };
    }

    /**
     * Send an existing scheduler now by its uuid
     * @summary Send scheduler by uuid
     * @param schedulerUuid The uuid of the scheduler to send now
     * @param req express request
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Post('{schedulerUuid}/send')
    @OperationId('sendSchedulerByUuid')
    async postByUuid(
        @Path() schedulerUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiTestSchedulerResponse> {
        this.setStatus(200);
        return {
            status: 'ok',
            results: {
                jobId: (
                    await this.services
                        .getSchedulerService()
                        .sendSchedulerByUuid(req.user!, schedulerUuid)
                ).jobId,
            },
        };
    }
}
