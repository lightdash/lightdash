import {
    ApiErrorPayload,
    ApiMobileAppLinkResponse,
    ApiMobileAppLinkStatusResponse,
    assertRegisteredAccount,
} from '@lightdash/common';
import {
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
import { toSessionUser } from '../auth/account';
import { isAuthenticated } from './authentication';
import { BaseController } from './baseController';

@Route('/api/v1/user/mobile/app-links')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('My Account')
export class MobileAppController extends BaseController {
    /**
     * Creates a link that opens the mobile app's store page. The link expires
     * after 30 minutes
     * @summary Create mobile app link
     */
    @Middlewares([isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/')
    @OperationId('CreateMobileAppLink')
    async createMobileAppLink(
        @Request() req: express.Request,
    ): Promise<ApiMobileAppLinkResponse> {
        assertRegisteredAccount(req.account);
        return {
            status: 'ok',
            results: await this.services
                .getMobileAppService()
                .createLink(toSessionUser(req.account)),
        };
    }

    /**
     * Gets whether a phone opened a mobile app link created by the current user
     * @summary Get mobile app link status
     * @param linkUuid The uuid of the mobile app link
     */
    @Middlewares([isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/{linkUuid}')
    @OperationId('GetMobileAppLinkStatus')
    async getMobileAppLinkStatus(
        @Request() req: express.Request,
        @Path() linkUuid: string,
    ): Promise<ApiMobileAppLinkStatusResponse> {
        assertRegisteredAccount(req.account);
        return {
            status: 'ok',
            results: await this.services
                .getMobileAppService()
                .getLinkStatus(toSessionUser(req.account), linkUuid),
        };
    }
}
