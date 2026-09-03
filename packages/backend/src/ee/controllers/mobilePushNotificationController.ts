import {
    assertRegisteredAccount,
    type ApiErrorPayload,
    type ApiMobilePushInstallationRequest,
    type ApiMobilePushInstallationResponse,
    type ApiMobilePushLiveActivityPushToStartTokenRequest,
    type ApiMobilePushLiveActivityPushToStartTokenResponse,
    type ApiMobilePushNotificationStatusResponse,
    type UUID,
} from '@lightdash/common';
import {
    Body,
    Delete,
    Get,
    Middlewares,
    OperationId,
    Path,
    Put,
    Request,
    Response,
    Route,
    SuccessResponse,
    Tags,
} from '@tsoa/runtime';
import express from 'express';
import { toSessionUser } from '../../auth/account';
import {
    allowApiKeyAuthentication,
    isAuthenticated,
} from '../../controllers/authentication';
import { BaseController } from '../../controllers/baseController';
import { type MobilePushNotificationService } from '../services/MobilePushNotificationService/MobilePushNotificationService';

@Route('/api/v1/mobile/push-notifications')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('Mobile push notifications')
export class MobilePushNotificationController extends BaseController {
    private getMobilePushNotificationService(): MobilePushNotificationService {
        return this.services.getMobilePushNotificationService<MobilePushNotificationService>();
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/status')
    @OperationId('getMobilePushNotificationStatus')
    async getMobilePushNotificationStatus(
        @Request() req: express.Request,
    ): Promise<ApiMobilePushNotificationStatusResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: this.getMobilePushNotificationService().getStatus(),
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Put('/installations/{installationUuid}')
    @OperationId('registerMobilePushInstallation')
    async registerInstallation(
        @Request() req: express.Request,
        @Path() installationUuid: UUID,
        @Body() body: ApiMobilePushInstallationRequest,
    ): Promise<ApiMobilePushInstallationResponse> {
        assertRegisteredAccount(req.account);
        const { authentication } = req.account;
        await this.getMobilePushNotificationService().registerInstallation({
            user: toSessionUser(req.account),
            installationUuid,
            platform: body.platform ?? 'ios',
            environment: body.environment,
            deviceToken: body.deviceToken,
            oauthClientId:
                authentication.type === 'oauth'
                    ? authentication.clientId
                    : null,
        });
        this.setStatus(200);
        return { status: 'ok', results: undefined };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Put('/installations/{installationUuid}/live-activity-push-to-start-token')
    @OperationId('registerMobilePushLiveActivityPushToStartToken')
    async registerLiveActivityPushToStartToken(
        @Request() req: express.Request,
        @Path() installationUuid: UUID,
        @Body() body: ApiMobilePushLiveActivityPushToStartTokenRequest,
    ): Promise<ApiMobilePushLiveActivityPushToStartTokenResponse> {
        assertRegisteredAccount(req.account);
        await this.getMobilePushNotificationService().registerPushToStartToken({
            user: toSessionUser(req.account),
            installationUuid,
            pushToken: body.pushToken,
        });
        this.setStatus(200);
        return { status: 'ok', results: undefined };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Delete('/installations/{installationUuid}')
    @OperationId('revokeMobilePushInstallation')
    async revokeInstallation(
        @Request() req: express.Request,
        @Path() installationUuid: UUID,
    ): Promise<ApiMobilePushInstallationResponse> {
        assertRegisteredAccount(req.account);
        await this.getMobilePushNotificationService().revokeInstallation({
            user: toSessionUser(req.account),
            installationUuid,
        });
        this.setStatus(200);
        return { status: 'ok', results: undefined };
    }
}
