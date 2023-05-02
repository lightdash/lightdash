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

@Route('/api/v1/projects/{projectUuid}/pinned-lists')
@Response<ApiErrorPayload>('default', 'Error')
export class PinningController extends Controller {
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
        const pinnedItems = await pinningService.getPinnedItems(
            req.user!,
            projectUuid,
            pinnedListUuid,
        );
        this.setStatus(200);
        return {
            status: 'ok',
            results: pinnedItems,
        };
    }
}
