import { ApiErrorPayload, ApiPinnedItems } from '@lightdash/common';
import express from 'express';
import {
    Controller,
    Get,
    Middlewares,
    OperationId,
    Path,
    Request,
    Response,
    Route,
    SuccessResponse,
} from 'tsoa';
import { pinningService } from '../services/services';
import { allowApiKeyAuthentication, isAuthenticated } from './authentication';

@Route('/api/v1/pinnedItems')
@Response<ApiErrorPayload>('default', 'Error')
export class PinningController extends Controller {
    /**
     * Get a pinned item
     * @param pinnedListUuid the list uuid for the pinned items
     * @param req express request
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('{pinnedListUuid}')
    @OperationId('getPinnedItems')
    async get(
        @Path() pinnedListUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiPinnedItems> {
        this.setStatus(200);
        const pinnedDashboards = await pinningService.getPinnedDashboards(
            pinnedListUuid,
        );
        const pinnedCharts = await pinningService.getPinnedCharts(
            pinnedListUuid,
        );
        const pinnedSpaces = await pinningService.getPinnedSpaces(
            pinnedListUuid,
        );
        return {
            dashboards: pinnedDashboards,
            charts: pinnedCharts,
            spaces: pinnedSpaces,
        };
    }
}
