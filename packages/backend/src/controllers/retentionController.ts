import {
    ApiErrorPayload,
    ApiRetentionEventNamesResponse,
    ApiRetentionQueryResponse,
    assertRegisteredAccount,
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

@Route('/api/v1/projects/{projectUuid}/retention')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('Retention')
export class RetentionController extends BaseController {
    /**
     * Get distinct event names from a dimension for retention event selection.
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
    @OperationId('GetRetentionEventNames')
    async getEventNames(
        @Path() projectUuid: string,
        @Query() exploreName: string,
        @Query() eventDimensionId: string,
        @Query() timestampFieldId: string,
        @Request() req: express.Request,
    ): Promise<ApiRetentionEventNamesResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);

        const results = await this.services
            .getRetentionService()
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
     * Execute a retention analysis query and return the cohort matrix
     * @summary Run retention query
     * @param projectUuid The project UUID
     * @param body The retention query configuration
     * @param req Express request
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/query')
    @OperationId('RunRetentionQuery')
    async runRetentionQuery(
        @Path() projectUuid: string,
        @Body() body: RetentionQueryRequest,
        @Request() req: express.Request,
    ): Promise<ApiRetentionQueryResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);

        const results = await this.services
            .getRetentionService()
            .runRetentionQuery(toSessionUser(req.account), projectUuid, body);

        return { status: 'ok', results };
    }
}
