import {
    type ApiErrorPayload,
    type ApiFavoriteItems,
    type ApiToggleFavorite,
    type ToggleFavoriteRequest,
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
import { allowApiKeyAuthentication, isAuthenticated } from './authentication';
import { BaseController } from './baseController';

@Route('/api/v1/projects/{projectUuid}/favorites')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('Content')
export class FavoritesController extends BaseController {
    /**
     * Get the current user's favorite items in a project
     * @summary Get favorites
     * @param projectUuid project uuid
     * @param req express request
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get()
    @OperationId('getFavorites')
    async getFavorites(
        @Path() projectUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiFavoriteItems> {
        const items = await this.services
            .getFavoritesService()
            .getFavorites(req.user!, projectUuid);
        this.setStatus(200);
        return {
            status: 'ok',
            results: items,
        };
    }

    /**
     * Toggle a favorite item for the current user
     * @summary Toggle favorite
     * @param projectUuid project uuid
     * @param req express request
     * @param body the content type and uuid to toggle
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Patch()
    @OperationId('toggleFavorite')
    async toggleFavorite(
        @Path() projectUuid: string,
        @Request() req: express.Request,
        @Body() body: ToggleFavoriteRequest,
    ): Promise<ApiToggleFavorite> {
        const result = await this.services
            .getFavoritesService()
            .toggleFavorite(
                req.user!,
                projectUuid,
                body.contentType,
                body.contentUuid,
            );
        this.setStatus(200);
        return {
            status: 'ok',
            results: result,
        };
    }
}
