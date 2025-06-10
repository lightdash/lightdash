import {
    ApiAiAgentResponse,
    ApiAiAgentStartThreadResponse,
    ApiAiAgentSummaryResponse,
    ApiAiAgentThreadGenerateRequest,
    ApiAiAgentThreadGenerateResponse,
    ApiAiAgentThreadMessageVizResponse,
    ApiAiAgentThreadResponse,
    ApiAiAgentThreadSummaryListResponse,
    ApiAiConversationMessages,
    ApiAiConversationResponse,
    ApiAiConversations,
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
            await this.getAiAgentService().scheduleGenerateAgentThreadResponse(
                req.user!,
                {
                    agentUuid,
                    threadUuid: undefined,
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
            await this.getAiAgentService().scheduleGenerateAgentThreadResponse(
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

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/{agentUuid}/threads/{threadUuid}/message/{messageUuid}/viz')
    @OperationId('getAgentThreadMessageViz')
    async getAgentThreadMessageViz(
        @Request() req: express.Request,
        @Path() agentUuid: string,
        @Path() threadUuid: string,
        @Path() messageUuid: string,
    ): Promise<ApiAiAgentThreadMessageVizResponse> {
        this.setStatus(200);

        return {
            status: 'ok',
            results:
                await this.getAiAgentService().generateAgentThreadMessageViz(
                    req.user!,
                    {
                        agentUuid,
                        threadUuid,
                        messageUuid,
                    },
                ),
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Patch('/messages/{messageUuid}/feedback')
    @OperationId('updatePromptFeedback')
    async updatePromptFeedback(
        @Request() req: express.Request,
        @Path() messageUuid: string,
        @Body() body: { humanScore: number },
    ): Promise<ApiSuccessEmpty> {
        this.setStatus(200);
        await this.getAiAgentService().updateHumanScoreForMessage(
            messageUuid,
            body.humanScore,
        );
        return {
            status: 'ok',
            results: undefined,
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/projects/{projectUuid}/conversations')
    @OperationId('getAiAgentConversations')
    async getAiAgentConversations(
        @Request() req: express.Request,
        @Path() projectUuid: string,
    ): Promise<ApiAiConversations> {
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.getAiAgentService().getConversations(
                req.user!,
                projectUuid,
            ),
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/projects/{projectUuid}/conversations/:aiThreadUuid/messages')
    @OperationId('getAiAgentConversationMessages')
    async getAiAgentConversationMessages(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Path() aiThreadUuid: string,
    ): Promise<ApiAiConversationMessages> {
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.getAiAgentService().getConversationMessages(
                req.user!,
                projectUuid,
                aiThreadUuid,
            ),
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/projects/{projectUuid}/conversations')
    @OperationId('createAiAgentConversation')
    async createAiAgentConversation(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Body() body: { question: string },
    ): Promise<ApiAiConversationResponse> {
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.getAiAgentService().createWebAppConversation(
                req.user!,
                projectUuid,
                body.question,
            ),
        };
    }

    protected getAiAgentService() {
        return this.services.getAiAgentService<AiAgentService>();
    }
}

@Route('/api/v1/projects/{projectUuid}/aiAgents')
@Hidden()
@Response<ApiErrorPayload>('default', 'Error')
export class ProjectAiAgentController extends BaseController {
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/')
    @OperationId('listProjectAgents')
    async listProjectAgents(
        @Request() req: express.Request,
        @Path() projectUuid: string,
    ): Promise<ApiAiAgentSummaryResponse> {
        this.setStatus(200);

        return {
            status: 'ok',
            results: await this.getAiAgentService().listAgents(
                req.user!,
                projectUuid,
            ),
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/{agentUuid}')
    @OperationId('getProjectAgent')
    async getProjectAgent(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Path() agentUuid: string,
    ): Promise<ApiAiAgentResponse> {
        this.setStatus(200);
        const agent = await this.getAiAgentService().getAgent(
            req.user!,
            agentUuid,
            projectUuid,
        );
        return {
            status: 'ok',
            results: agent,
        };
    }

    protected getAiAgentService() {
        return this.services.getAiAgentService<AiAgentService>();
    }
}
