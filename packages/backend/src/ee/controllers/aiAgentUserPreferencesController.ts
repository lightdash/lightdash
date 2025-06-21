import {
    ApiErrorPayload,
    ApiGetUserAgentPreferencesResponse,
    ApiUpdateUserAgentPreferences,
    ApiUpdateUserAgentPreferencesResponse,
} from '@lightdash/common';
import {
    Body,
    Get,
    Hidden,
    Middlewares,
    OperationId,
    Path,
    Post,
    Request,
    Response,
    Route,
    SuccessResponse,
} from '@tsoa/runtime';
import express from 'express';
import {
    allowApiKeyAuthentication,
    isAuthenticated,
} from '../../controllers/authentication';
import { BaseController } from '../../controllers/baseController';
import { type AiAgentService } from '../services/AiAgentService';

@Route('/api/v1/projects/{projectUuid}/aiAgents/preferences')
@Hidden()
@Response<ApiErrorPayload>('default', 'Error')
export class AiAgentUserPreferencesController extends BaseController {
    protected getAiAgentService() {
        return this.services.getAiAgentService<AiAgentService>();
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get()
    @OperationId('getUserAgentPreferences')
    async getUserAgentPreferences(
        @Request() req: express.Request,
        @Path() projectUuid: string,
    ): Promise<ApiGetUserAgentPreferencesResponse> {
        this.setStatus(200);

        const userPreferences =
            await this.getAiAgentService().getUserAgentPreferences(
                req.user!,
                projectUuid,
            );
        return {
            status: 'ok',
            results: userPreferences,
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post()
    @OperationId('updateUserAgentPreferences')
    async setUserDefaultAgent(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Body() body: ApiUpdateUserAgentPreferences,
    ): Promise<ApiUpdateUserAgentPreferencesResponse> {
        this.setStatus(200);
        await this.getAiAgentService().updateUserAgentPreferences(
            req.user!,
            projectUuid,
            body,
        );
        return {
            status: 'ok',
            results: undefined,
        };
    }
}
