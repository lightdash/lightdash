import {
    assertRegisteredAccount,
    type ApiAiOrganizationRuntimeSettingsResponse,
    type ApiErrorPayload,
} from '@lightdash/common';
import {
    Get,
    Middlewares,
    OperationId,
    Request,
    Response,
    Route,
    SuccessResponse,
} from '@tsoa/runtime';
import express from 'express';
import { toSessionUser } from '../../auth/account';
import {
    allowApiKeyAuthentication,
    isAuthenticated,
} from '../../controllers/authentication';
import { BaseController } from '../../controllers/baseController';
import { type AiOrganizationSettingsService } from '../services/AiOrganizationSettingsService';

@Route('/api/v1/aiAgents')
@Response<ApiErrorPayload>('default', 'Error')
export class AiOrganizationSettingsController extends BaseController {
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Retrieved AI organization runtime settings')
    @Get('/settings')
    @OperationId('getAiOrganizationRuntimeSettings')
    async getRuntimeSettings(
        @Request() req: express.Request,
    ): Promise<ApiAiOrganizationRuntimeSettingsResponse> {
        assertRegisteredAccount(req.account);
        const results =
            await this.getAiOrganizationSettingsService().getRuntimeSettings(
                toSessionUser(req.account),
            );
        this.setStatus(200);
        return { status: 'ok', results };
    }

    protected getAiOrganizationSettingsService() {
        return this.services.getAiOrganizationSettingsService<AiOrganizationSettingsService>();
    }
}
