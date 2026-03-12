import {
    ApiErrorPayload,
    KnexPaginateArgs,
    type ApiProjectQueryHistoryResponse,
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
import { allowApiKeyAuthentication, isAuthenticated } from '../authentication';
import { BaseController } from '../baseController';

@Route('/api/v2/projects/{projectUuid}/query-history')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('v2', 'Query History')
export class ProjectQueryHistoryController extends BaseController {
    /**
     * Retrieves paginated query history rows with summary metrics for a project
     * @summary Get project query history
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get()
    @OperationId('getProjectQueryHistory')
    async getProjectQueryHistory(
        @Path() projectUuid: string,
        @Request() req: express.Request,
        @Query() page?: number,
        @Query() pageSize?: number,
    ): Promise<ApiProjectQueryHistoryResponse> {
        this.setStatus(200);

        const paginateArgs: KnexPaginateArgs | undefined =
            page && pageSize ? { page, pageSize } : undefined;

        const results = await this.services
            .getProjectQueryHistoryService()
            .getProjectQueryHistory(req.user!, projectUuid, paginateArgs);

        return {
            status: 'ok',
            results,
        };
    }
}
