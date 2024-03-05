import {
    ApiErrorPayload,
    ApiPinnedItems,
    UpdatePinnedItemOrder,
} from '@lightdash/common';
import {
    Body,
    Get,
    Middlewares,
    OperationId,
    Patch,
    Path,
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
    unauthorisedInDemo,
} from './authentication';
import { BaseController } from './baseController';

@Route('/api/v1/projects/{projectUuid}/pinned-lists')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('Content')
export class PinningController extends BaseController {
    /**
     * Get pinned items
     * @param projectUuid project uuid
     * @param pinnedListUuid the list uuid for the pinned items
     * @param req express request
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('{pinnedListUuid}/items')
    @OperationId('getPinnedItems')
    async get(
        @Path() projectUuid: string,
        @Path() pinnedListUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiPinnedItems> {
        const pinnedItems = await this.services
            .getPinningService()
            .getPinnedItems(req.user!, projectUuid, pinnedListUuid);
        this.setStatus(200);
        return {
            status: 'ok',
            results: pinnedItems,
        };
    }

    /**
     * Update pinned items order
     * @param projectUuid project uuid
     * @param pinnedListUuid the list uuid for the pinned items
     * @param req express request
     * @param body the new order of the pinned items
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Patch('{pinnedListUuid}/items/order')
    @OperationId('updatePinnedItemsOrder')
    async post(
        @Path() projectUuid: string,
        @Path() pinnedListUuid: string,
        @Request() req: express.Request,
        @Body()
        body: Array<UpdatePinnedItemOrder>,
    ): Promise<ApiPinnedItems> {
        const pinnedItems = await this.services
            .getPinningService()
            .updatePinnedItemsOrder(
                req.user!,
                projectUuid,
                pinnedListUuid,
                body,
            );
        this.setStatus(200);
        return {
            status: 'ok',
            results: pinnedItems,
        };
    }
}
