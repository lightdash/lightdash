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
import { allowApiKeyAuthentication, isAuthenticated } from './authentication';

@Route('/api/v1/pinnedItems')
@Response<ApiErrorPayload>('default', 'Error')
export class PinnedItemsController extends Controller {
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
        // this portion will be replaced by the service method like so:
        // await pinningService.getPinnedCharts(pinnedListUuid);
        // await pinningService.getPinnedDashboards(pinnedListUuid);
        // await pinningService.getPinnedSpaces(pinnedListUuid);
        // return { ...dashboards, ...charts, ...spaces };
        const pinnedItems = {} as ApiPinnedItems;
        return pinnedItems;
    }
}
