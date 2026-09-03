import {
    ApiErrorPayload,
    ApiScimRequestLogListResponse,
    assertRegisteredAccount,
} from '@lightdash/common';
import {
    Get,
    Hidden,
    Middlewares,
    OperationId,
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
} from '../../controllers/authentication';
import { BaseController } from '../../controllers/baseController';
import { ScimService } from '../services/ScimService/ScimService';

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

@Route('/api/v1/scim/request-logs')
@Hidden()
@Response<ApiErrorPayload>('default', 'Error')
@Tags('SCIM')
export class ScimRequestLogController extends BaseController {
    /**
     * Get the organization's SCIM request log, newest first
     * @summary List SCIM request logs
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/')
    @OperationId('GetScimRequestLogs')
    async getScimRequestLogs(
        @Request() req: express.Request,
        @Query() page?: number,
        @Query() pageSize?: number,
    ): Promise<ApiScimRequestLogListResponse> {
        assertRegisteredAccount(req.account);
        const results = await this.services
            .getScimService<ScimService>()
            .getRequestLogs(req.account, {
                page: page ?? 1,
                pageSize: Math.min(
                    pageSize ?? DEFAULT_PAGE_SIZE,
                    MAX_PAGE_SIZE,
                ),
            });
        this.setStatus(200);
        return {
            status: 'ok',
            results,
        };
    }
}
