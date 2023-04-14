import { ApiErrorPayload, ApiPinnedItem } from '@lightdash/common';
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

@Route('/api/v1/pinnedItem')
@Response<ApiErrorPayload>('default', 'Error')
export class PinnedItemsController extends Controller {
    /**
     * Get a pinned item
     * @param pinnedListUuid the list uuid for the pinned item
     * @param req express request
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('{pinnedListUuid}')
    @OperationId('getPinnedItem')
    async get(
        @Path() pinnedListUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiPinnedItem> {
        this.setStatus(200);
        // this portion will be replaced by the service method like so:
        // await pinningService.getPinnedItem(pinnedListUuid);
        const pinnedItem = {} as ApiPinnedItem;
        return pinnedItem;
    }
}
