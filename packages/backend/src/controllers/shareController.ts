import {
    ApiErrorPayload,
    ApiShareResponse,
    CreateShareUrl,
} from '@lightdash/common';
import {
    Body,
    Get,
    Middlewares,
    OperationId,
    Path,
    Post,
    Request,
    Response,
    Route,
    SuccessResponse,
    Tags,
} from '@tsoa/runtime';
import express from 'express';
import { allowApiKeyAuthentication, isAuthenticated } from './authentication';
import { BaseController } from './baseController';

@Route('/api/v1/share')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('Share links')
export class ShareController extends BaseController {
    /**
     * Get a share url from a short url id
     * @param nanoId the short id for the share url
     * @param req express request
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @Get('{nanoId}')
    @OperationId('getShareUrl')
    async get(
        @Path() nanoId: string,
        @Request() req: express.Request,
    ): Promise<ApiShareResponse> {
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getShareService()
                .getShareUrl(req.user!, nanoId),
        };
    }

    /**
     * Given a full URL generates a short url id that can be used for sharing
     * @param body a full URL used to generate a short url id
     * @param req express request
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('201', 'Created')
    @Post('/')
    @OperationId('CreateShareUrl')
    async create(
        @Body() body: CreateShareUrl,
        @Request() req: express.Request,
    ): Promise<ApiShareResponse> {
        const shareUrl = await this.services
            .getShareService()
            .createShareUrl(req.user!, body.path, body.params);
        this.setStatus(201);
        return {
            status: 'ok',
            results: shareUrl,
        };
    }
}
