import {
    ApiErrorPayload,
    ApiEventNamesResponse,
    ApiFunnelQueryResponse,
    ApiRetentionQueryResponse,
    assertRegisteredAccount,
    FunnelQueryRequest,
    RetentionQueryRequest,
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
import { toSessionUser } from '../auth/account';
import { allowApiKeyAuthentication, isAuthenticated } from './authentication';
import { BaseController } from './baseController';

@Route('/api/v1/projects/{projectUuid}/event-analytics')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('Event analytics')
export class EventAnalyticsController extends BaseController {
    /**
     * Gets the distinct event names of an explore, scanning the last 30 days.
     * @summary Get event names
     * @param projectUuid The project UUID
     * @param exploreName The explore to query
     * @param eventDimensionId The dimension that holds event names
     * @param timestampFieldId The timestamp dimension that bounds the scan
     * @param req Express request
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/event-names')
    @OperationId('GetEventNames')
    async getEventNames(
        @Path() projectUuid: string,
        @Query() exploreName: string,
        @Query() eventDimensionId: string,
        @Query() timestampFieldId: string,
        @Request() req: express.Request,
    ): Promise<ApiEventNamesResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);

        const results = await this.services
            .getEventAnalyticsService()
            .getEventNames(
                toSessionUser(req.account),
                projectUuid,
                exploreName,
                eventDimensionId,
                timestampFieldId,
            );

        return { status: 'ok', results };
    }

    /**
     * Runs a funnel query and returns conversion per step.
     * @summary Run funnel query
     * @param projectUuid The project UUID
     * @param body The funnel definition
     * @param req Express request
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/funnel')
    @OperationId('RunFunnelQuery')
    async runFunnelQuery(
        @Path() projectUuid: string,
        @Body() body: FunnelQueryRequest,
        @Request() req: express.Request,
    ): Promise<ApiFunnelQueryResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);

        const results = await this.services
            .getEventAnalyticsService()
            .runFunnelQuery(toSessionUser(req.account), projectUuid, body);

        return { status: 'ok', results };
    }

    /**
     * Runs a retention query and returns the cohort matrix.
     * @summary Run retention query
     * @param projectUuid The project UUID
     * @param body The retention definition
     * @param req Express request
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/retention')
    @OperationId('RunRetentionQuery')
    async runRetentionQuery(
        @Path() projectUuid: string,
        @Body() body: RetentionQueryRequest,
        @Request() req: express.Request,
    ): Promise<ApiRetentionQueryResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);

        const results = await this.services
            .getEventAnalyticsService()
            .runRetentionQuery(toSessionUser(req.account), projectUuid, body);

        return { status: 'ok', results };
    }
}
