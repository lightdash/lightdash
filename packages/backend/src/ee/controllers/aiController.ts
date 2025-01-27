import {
    ApiAiConversationMessages,
    ApiAiConversationResponse,
    ApiAiConversations,
    ApiAiDashboardSummaryResponse,
    ApiAiGetDashboardSummaryResponse,
    ApiErrorPayload,
    DashboardSummary,
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
import { AiService } from '../services/AiService/AiService';

@Route('/api/v1/ai/:projectUuid')
@Hidden()
@Response<ApiErrorPayload>('default', 'Error')
export class AiController extends BaseController {
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/dashboard/:dashboardUuid/summary')
    @OperationId('createDashboardSummary')
    async createDashboardSummary(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Path() dashboardUuid: string,
        @Body() body: Pick<DashboardSummary, 'context' | 'tone' | 'audiences'>,
    ): Promise<ApiAiDashboardSummaryResponse> {
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.getAiService().createDashboardSummary(
                req.user!,
                projectUuid,
                dashboardUuid,
                body,
            ),
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/dashboard/:dashboardUuid/summary')
    @OperationId('getDashboardSummary')
    async getDashboardSummary(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Path() dashboardUuid: string,
    ): Promise<ApiAiGetDashboardSummaryResponse> {
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.getAiService().getDashboardSummary(
                req.user!,
                projectUuid,
                dashboardUuid,
            ),
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/conversations')
    @OperationId('getConversations')
    async getConversations(
        @Request() req: express.Request,
        @Path() projectUuid: string,
    ): Promise<ApiAiConversations> {
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.getAiService().getConversations(
                req.user!,
                projectUuid,
            ),
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/conversations/:aiThreadUuid/messages')
    @OperationId('getMessages')
    async getMessages(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Path() aiThreadUuid: string,
    ): Promise<ApiAiConversationMessages> {
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.getAiService().getConversationMessages(
                req.user!,
                projectUuid,
                aiThreadUuid,
            ),
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/conversations')
    @OperationId('createConversation')
    async createConversation(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Body() body: { question: string },
    ): Promise<ApiAiConversationResponse> {
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.getAiService().createWebAppConversation(
                req.user!,
                projectUuid,
                body.question,
            ),
        };
    }

    /**
     * Convenience method to access the ai service without having
     * to specify an interface type.
     */
    protected getAiService() {
        return this.services.getAiService<AiService>();
    }
}
