import {
    ApiErrorPayload,
    assertRegisteredAccount,
    type ApiMobileAppAccessResponse,
} from '@lightdash/common';
import {
    Get,
    Middlewares,
    OperationId,
    Request,
    Response,
    Route,
    SuccessResponse,
    Tags,
} from '@tsoa/runtime';
import express from 'express';
import { toSessionUser } from '../auth/account';
import { requireOAuthScopeOperation } from '../auth/oauthScopes/unchecked';
import { allowApiKeyAuthentication, isAuthenticated } from './authentication';
import { BaseController } from './baseController';

@Route('/api/v1/mobile/access')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('Mobile')
export class MobileAppAccessController extends BaseController {
    /**
     * Tells a mobile app whether the organization of the current sign-in can
     * use the mobile apps. A disabled organization gets a 401 with the code
     * mobile_org_disabled
     * @summary Get mobile app access
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        requireOAuthScopeOperation(
            'MobileAppAccessController.getMobileAppAccess',
        ),
    ])
    @SuccessResponse('200', 'Success')
    @Get('/')
    @OperationId('getMobileAppAccess')
    async getMobileAppAccess(
        @Request() req: express.Request,
    ): Promise<ApiMobileAppAccessResponse> {
        assertRegisteredAccount(req.account);
        this.setHeader('Cache-Control', 'no-store');
        return {
            status: 'ok',
            results: await this.services
                .getMobileSignInService()
                .getAppAccess(toSessionUser(req.account)),
        };
    }
}
