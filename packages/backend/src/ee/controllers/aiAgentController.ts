import {
    ApiAiAgentResponse,
    ApiAiAgentStartThreadResponse,
    ApiAiAgentSummaryResponse,
    ApiAiAgentThreadGenerateRequest,
    ApiAiAgentThreadGenerateResponse,
    ApiAiAgentThreadResponse,
    ApiAiAgentThreadSummaryListResponse,
    ApiCreateAiAgent,
    ApiCreateAiAgentResponse,
    ApiErrorPayload,
    ApiSuccessEmpty,
    ApiUpdateAiAgent,
} from '@lightdash/common';
import {
    Body,
    Delete,
    Get,
    Hidden,
    Middlewares,
    OperationId,
    Patch,
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

@Route('/api/v1/aiAgents')
@Hidden()
@Response<ApiErrorPayload>('default', 'Error')
export class AiAgentController extends BaseController {
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/')
    @OperationId('listAgents')
    async listAgents(
        @Request() req: express.Request,
    ): Promise<ApiAiAgentSummaryResponse> {
        this.setStatus(200);

        return {
            status: 'ok',
            results: await this.getAiAgentService().listAgents(req.user!),
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/{agentUuid}')
    @OperationId('getAgent')
    async getAgent(
        @Request() req: express.Request,
        @Path() agentUuid: string,
    ): Promise<ApiAiAgentResponse> {
        this.setStatus(200);
        const agent = await this.getAiAgentService().getAgent(
            req.user!,
            agentUuid,
        );
        return {
            status: 'ok',
            results: agent,
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('201', 'Created')
    @Post('/')
    @OperationId('createAgent')
    async createAgent(
        @Request() req: express.Request,
        @Body() body: ApiCreateAiAgent,
    ): Promise<ApiCreateAiAgentResponse> {
        this.setStatus(201);
        const agent = await this.getAiAgentService().createAgent(
            req.user!,
            body,
        );
        return {
            status: 'ok',
            results: agent,
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Patch('/{agentUuid}')
    @OperationId('updateAgent')
    async updateAgent(
        @Request() req: express.Request,
        @Path() agentUuid: string,
        @Body() body: ApiUpdateAiAgent,
    ): Promise<ApiAiAgentResponse> {
        this.setStatus(200);
        const agent = await this.getAiAgentService().updateAgent(
            req.user!,
            agentUuid,
            body,
        );
        return {
            status: 'ok',
            results: agent,
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Delete('/{agentUuid}')
    @OperationId('deleteAgent')
    async deleteAgent(
        @Request() req: express.Request,
        @Path() agentUuid: string,
    ): Promise<ApiSuccessEmpty> {
        this.setStatus(200);
        await this.getAiAgentService().deleteAgent(req.user!, agentUuid);

        return {
            status: 'ok',
            results: undefined,
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/{agentUuid}/threads')
    @OperationId('listAgentThreads')
    async listAgentThreads(
        @Request() req: express.Request,
        @Path() agentUuid: string,
    ): Promise<ApiAiAgentThreadSummaryListResponse> {
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.getAiAgentService().listAgentThreads(
                req.user!,
                agentUuid,
            ),
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/{agentUuid}/threads/{threadUuid}')
    @OperationId('getAgentThread')
    async getAgentThread(
        @Request() req: express.Request,
        @Path() agentUuid: string,
        @Path() threadUuid: string,
    ): Promise<ApiAiAgentThreadResponse> {
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.getAiAgentService().getAgentThread(
                req.user!,
                agentUuid,
                threadUuid,
            ),
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/{agentUuid}/generate')
    @OperationId('startAgentThread')
    async createAgentThread(
        @Request() req: express.Request,
        @Path() agentUuid: string,
        @Body() body: ApiAiAgentThreadGenerateRequest,
    ): Promise<ApiAiAgentStartThreadResponse> {
        this.setStatus(200);
        const { jobId, threadUuid } =
            await this.getAiAgentService().generateAgentThreadResponse(
                req.user!,
                {
                    agentUuid,
                    prompt: body.prompt,
                },
            );
        return {
            status: 'ok',
            results: { jobId, threadUuid },
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/{agentUuid}/threads/{threadUuid}/generate')
    @OperationId('generateAgentThreadResponse')
    async generateAgentThreadResponse(
        @Request() req: express.Request,
        @Path() agentUuid: string,
        @Path() threadUuid: string,
        @Body() body: ApiAiAgentThreadGenerateRequest,
    ): Promise<ApiAiAgentThreadGenerateResponse> {
        this.setStatus(200);
        const { jobId } =
            await this.getAiAgentService().generateAgentThreadResponse(
                req.user!,
                {
                    agentUuid,
                    threadUuid,
                    prompt: body.prompt,
                },
            );
        return {
            status: 'ok',
            results: { jobId },
        };
    }

    protected getAiAgentService() {
        return this.services.getAiAgentService<AiAgentService>();
    }
}
