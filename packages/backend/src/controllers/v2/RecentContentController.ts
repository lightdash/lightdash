import {
    assertRegisteredAccount,
    assertSessionAuth,
    ForbiddenError,
    type Account,
    type ApiErrorPayload,
    type ApiRecentContentResponse,
    type ApiSuccessEmpty,
    type RecordRecentContentView,
    type RegisteredAccount,
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
import { allowOauthAuthentication, isAuthenticated } from '../authentication';
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
    @Middlewares([allowOauthAuthentication, isAuthenticated])
    async recordView(
        @Request() req: express.Request,
        @Body() body: RecordRecentContentView,
    ): Promise<ApiSuccessEmpty> {
        const account = await this.assertViewerOpensContent(req.account);
        await this.services
            .getRecentContentService()
            .recordView(toSessionUser(account), body);
        return { status: 'ok', results: undefined };
    }

    private async assertViewerOpensContent(
        account: Account | undefined,
    ): Promise<RegisteredAccount> {
        const { authentication } = account ?? {};
        if (authentication?.type === 'session') {
            assertRegisteredAccount(account);
            return account;
        }
        if (
            authentication?.type === 'oauth' &&
            (await this.services
                .getOauthService()
                .isMobileClient(authentication.clientId))
        ) {
            assertRegisteredAccount(account);
            return account;
        }
        throw new ForbiddenError(
            `${authentication?.type} Account is not session auth`,
        );
    }
}
