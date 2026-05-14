import {
    ApiErrorPayload,
    ApiFunnelEventNamesResponse,
    ApiFunnelQueryResponse,
    assertRegisteredAccount,
    FunnelQueryRequest,
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

@Route('/api/v1/projects/{projectUuid}/funnel')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('Funnel')
export class FunnelController extends BaseController {
    /**
     * Get distinct event names from a dimension for funnel step selection.
     * Scans the last 30 days of data to limit query cost.
     * @summary Get event names
     * @param projectUuid The project UUID
     * @param exploreName The explore to query
     * @param eventDimensionId The dimension containing event names
     * @param timestampFieldId The timestamp dimension used to filter to last 30 days
     * @param req Express request
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/event-names')
    @OperationId('GetFunnelEventNames')
    async getEventNames(
        @Path() projectUuid: string,
        @Query() exploreName: string,
        @Query() eventDimensionId: string,
        @Query() timestampFieldId: string,
        @Request() req: express.Request,
    ): Promise<ApiFunnelEventNamesResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);

        const results = await this.services
            .getFunnelService()
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
     * Execute a funnel analysis query and return conversion metrics
     * @summary Run funnel query
     * @param projectUuid The project UUID
     * @param body The funnel query configuration
     * @param req Express request
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/query')
    @OperationId('RunFunnelQuery')
    async runFunnelQuery(
        @Path() projectUuid: string,
        @Body() body: FunnelQueryRequest,
        @Request() req: express.Request,
    ): Promise<ApiFunnelQueryResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);

        const results = await this.services
            .getFunnelService()
            .runFunnelQuery(toSessionUser(req.account), projectUuid, body);

        return { status: 'ok', results };
    }
}
