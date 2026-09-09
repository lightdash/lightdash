import {
    assertSessionAuth,
    type ApiErrorPayload,
    type ApiSuccessEmpty,
    type RecordRecentContentView,
} from '@lightdash/common';
import {
    Body,
    Middlewares,
    Post,
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
