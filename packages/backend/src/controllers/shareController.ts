import { CreateShareUrl, ShareUrl } from '@lightdash/common';
import express from 'express';
import {
    Body,
    Controller,
    Get,
    Middlewares,
    Path,
    Post,
    Request,
    Response,
    Route,
    SuccessResponse,
} from 'tsoa';
import { shareService } from '../services/services';
import { isAuthenticated } from './authentication';

type ErrorPayload = {
    status: 'error';
    error: {
        statusCode: number;
        name: string;
        message?: string;
        data?: any;
    };
};

@Route('/api/v1/share')
@Response<ErrorPayload>('default', 'Error')
export class ShareController extends Controller {
    /**
     * Get a share url from a
     * @param nanoId the short id for the share url
     * @param req express request
     */
    @Middlewares([isAuthenticated])
    @Get('{nanoId}')
    async get(
        @Path() nanoId: string,
        @Request() req: express.Request,
    ): Promise<{ status: 'ok'; results: ShareUrl }> {
        return {
            status: 'ok',
            results: await shareService.getShareUrl(req.user!, nanoId),
        };
    }

    @Middlewares([isAuthenticated])
    @SuccessResponse('201', 'Created')
    @Post('/')
    async create(
        @Body() body: CreateShareUrl,
        @Request() req: express.Request,
    ): Promise<{ status: 'ok'; results: ShareUrl }> {
        const shareUrl = await shareService.createShareUrl(
            req.user!,
            body.path,
            body.params,
        );
        this.setStatus(201);
        return {
            status: 'ok',
            results: shareUrl,
        };
    }
}
