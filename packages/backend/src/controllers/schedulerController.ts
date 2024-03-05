import {
    ApiErrorPayload,
    ApiJobStatusResponse,
    ApiScheduledJobsResponse,
    ApiSchedulerAndTargetsResponse,
    ApiSchedulerLogsResponse,
    ApiTestSchedulerResponse,
    SchedulerJobStatus,
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
    Request,
    Response,
    Route,
    SuccessResponse,
    Tags,
} from '@tsoa/runtime';
import express from 'express';
import { schedulerService } from '../services/services';
import {
    allowApiKeyAuthentication,
    isAuthenticated,
    unauthorisedInDemo,
} from './authentication';
import { BaseController } from './baseController';

@Route('/api/v1/schedulers')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('Schedulers')
export class SchedulerController extends BaseController {
    /**
     * Get scheduled logs
     * @param req express request
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/{projectUuid}/logs')
    @OperationId('getSchedulerLogs')
    async getLogs(
        @Path() projectUuid: string,

        @Request() req: express.Request,
    ): Promise<ApiSchedulerLogsResponse> {
        this.setStatus(200);
        return {
            status: 'ok',
            results: await schedulerService.getSchedulerLogs(
                req.user!,
                projectUuid,
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
            results: await schedulerService.getScheduler(
                req.user!,
                schedulerUuid,
            ),
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
        @Body() body: any, // TODO: It should be UpdateSchedulerAndTargetsWithoutId but tsoa returns an error
    ): Promise<ApiSchedulerAndTargetsResponse> {
        this.setStatus(200);
        return {
            status: 'ok',
            results: await schedulerService.updateScheduler(
                req.user!,
                schedulerUuid,
                body,
            ),
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
            results: await schedulerService.setSchedulerEnabled(
                req.user!,
                schedulerUuid,
                body.enabled,
            ),
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
        await schedulerService.deleteScheduler(req.user!, schedulerUuid);
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
            results: await schedulerService.getScheduledJobs(
                req.user!,
                schedulerUuid,
            ),
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
        const { status, details } = await schedulerService.getJobStatus(jobId);
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
        @Body() body: any, // TODO: It should be CreateSchedulerAndTargets but tsoa returns an error
    ): Promise<ApiTestSchedulerResponse> {
        this.setStatus(200);

        return {
            status: 'ok',
            results: {
                jobId: (await schedulerService.sendScheduler(req.user!, body))
                    .jobId,
            },
        };
    }
}
