import {
    assertSessionAuth,
    type ApiErrorPayload,
    type ApiRecentContentResponse,
    type ApiSuccessEmpty,
    type RecordRecentContentView,
    type UUID,
} from '@lightdash/common';
import {
    Body,
    Get,
    Middlewares,
    Post,
    Query,
    Request,
    Response,
    Route,
    Tags,
} from '@tsoa/runtime';
import type express from 'express';
import { toSessionUser } from '../../auth/account';
import { isAuthenticated } from '../authentication';
import { BaseController } from '../baseController';

@Route('/api/v2/content/recently-viewed')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('v2', 'Content')
export class RecentContentController extends BaseController {
    @Get('/')
    @Middlewares([isAuthenticated])
    async getRecentlyViewed(
        @Request() req: express.Request,
        @Query() projectUuid: UUID,
    ): Promise<ApiRecentContentResponse> {
        assertSessionAuth(req.account);
        return {
            status: 'ok',
            results: await this.services
                .getRecentContentService()
                .getRecentlyViewed(toSessionUser(req.account), projectUuid),
        };
    }

    @Post('/')
    @Middlewares([isAuthenticated])
    async recordView(
        @Request() req: express.Request,
        @Body() body: RecordRecentContentView,
    ): Promise<ApiSuccessEmpty> {
        assertSessionAuth(req.account);
        await this.services
            .getRecentContentService()
            .recordView(toSessionUser(req.account), body);
        return { status: 'ok', results: undefined };
    }
}
