import {
    assertRegisteredAccount,
    type ApiErrorPayload,
    type ApiMobilePushLiveActivityRequest,
    type ApiMobilePushLiveActivityResponse,
} from '@lightdash/common';
import {
    Body,
    Delete,
    Middlewares,
    OperationId,
    Path,
    Put,
    Query,
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

@Route(
    '/api/v1/projects/{projectUuid}/aiAgents/{agentUuid}/threads/{threadUuid}/live-activities',
)
@Response<ApiErrorPayload>('default', 'Error')
@Tags('AI agent Live Activities')
export class AiAgentLiveActivityController extends BaseController {
    private getMobilePushNotificationService(): MobilePushNotificationService {
        return this.services.getMobilePushNotificationService<MobilePushNotificationService>();
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Put('/{liveActivityUuid}')
    @OperationId('registerAiAgentLiveActivity')
    async registerLiveActivity(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Path() agentUuid: string,
        @Path() threadUuid: string,
        @Path() liveActivityUuid: string,
        @Body() body: ApiMobilePushLiveActivityRequest,
    ): Promise<ApiMobilePushLiveActivityResponse> {
        assertRegisteredAccount(req.account);
        await this.getMobilePushNotificationService().registerLiveActivity({
            user: toSessionUser(req.account),
            projectUuid,
            agentUuid,
            threadUuid,
            liveActivityUuid,
            installationUuid: body.installationUuid,
            promptUuid: body.promptUuid,
            pushToken: body.pushToken,
        });
        this.setStatus(200);
        return { status: 'ok', results: undefined };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Delete('/{liveActivityUuid}')
    @OperationId('revokeAiAgentLiveActivity')
    async revokeLiveActivity(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Path() agentUuid: string,
        @Path() threadUuid: string,
        @Path() liveActivityUuid: string,
        @Query() installationUuid: string,
    ): Promise<ApiMobilePushLiveActivityResponse> {
        assertRegisteredAccount(req.account);
        await this.getMobilePushNotificationService().revokeLiveActivity({
            user: toSessionUser(req.account),
            installationUuid,
            projectUuid,
            agentUuid,
            threadUuid,
            liveActivityUuid,
        });
        this.setStatus(200);
        return { status: 'ok', results: undefined };
    }
}
