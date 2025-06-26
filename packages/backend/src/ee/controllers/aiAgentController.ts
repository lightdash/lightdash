import {
    ApiAiAgentResponse,
    ApiAiAgentSummaryResponse,
    ApiAiAgentThreadCreateRequest,
    ApiAiAgentThreadCreateResponse,
    ApiAiAgentThreadMessageCreateRequest,
    ApiAiAgentThreadMessageCreateResponse,
    ApiAiAgentThreadMessageVizQueryResponse,
    ApiAiAgentThreadMessageVizResponse,
    ApiAiAgentThreadResponse,
    ApiAiAgentThreadSummaryListResponse,
    ApiAiConversationMessages,
    ApiAiConversationResponse,
    ApiAiConversations,
    ApiCreateAiAgent,
    ApiCreateAiAgentResponse,
    ApiErrorPayload,
    ApiGetUserAgentPreferencesResponse,
    ApiSuccessEmpty,
    ApiUpdateAiAgent,
    ApiUpdateUserAgentPreferences,
    ApiUpdateUserAgentPreferencesResponse,
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
    Query,
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
        @Query() allUsers?: boolean,
    ): Promise<ApiAiAgentThreadSummaryListResponse> {
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.getAiAgentService().listAgentThreads(
                req.user!,
                agentUuid,
                allUsers,
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
    @Post('/{agentUuid}/threads')
    @OperationId('createAgentThread')
    async createAgentThread(
        @Request() req: express.Request,
        @Path() agentUuid: string,
        @Body() body: ApiAiAgentThreadCreateRequest,
    ): Promise<ApiAiAgentThreadCreateResponse> {
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.getAiAgentService().createAgentThread(
                req.user!,
                agentUuid,
                body,
            ),
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/{agentUuid}/threads/{threadUuid}/messages')
    @OperationId('createAgentThreadMessage')
    async createAgentThreadMessage(
        @Request() req: express.Request,
        @Path() agentUuid: string,
        @Path() threadUuid: string,
        @Body() body: ApiAiAgentThreadMessageCreateRequest,
    ): Promise<ApiAiAgentThreadMessageCreateResponse> {
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.getAiAgentService().createAgentThreadMessage(
                req.user!,
                agentUuid,
                threadUuid,
                body,
            ),
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/{agentUuid}/threads/{threadUuid}/stream')
    @OperationId('streamAgentThreadResponse')
    async streamAgentThreadResponse(
        @Request() req: express.Request,
        @Path() agentUuid: string,
        @Path() threadUuid: string,
    ): Promise<void> {
        const stream = await this.getAiAgentService().streamAgentThreadResponse(
            req.user!,
            {
                agentUuid,
                threadUuid,
            },
        );

        /**
         * @ref https://github.com/lukeautry/tsoa/issues/44#issuecomment-357784246
         * Hack to get the response object from the request
         */
        stream.pipeDataStreamToResponse(req.res!);
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
    @Get('/{agentUuid}/threads/{threadUuid}/message/{messageUuid}/viz-query')
    @OperationId('getAgentThreadMessageVizQuery')
    async getAgentThreadMessageVizQuery(
        @Request() req: express.Request,
        @Path() agentUuid: string,
        @Path() threadUuid: string,
        @Path() messageUuid: string,
    ): Promise<ApiAiAgentThreadMessageVizQueryResponse> {
        this.setStatus(200);

        return {
            status: 'ok',
            results:
                await this.getAiAgentService().getAgentThreadMessageVizQuery(
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
            results: userPreferences ?? undefined,
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

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('201', 'Created')
    @Post('/')
    @OperationId('createProjectAgent')
    async createProjectAgent(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Body() body: ApiCreateAiAgent,
    ): Promise<ApiCreateAiAgentResponse> {
        this.setStatus(201);
        const agent = await this.getAiAgentService().createAgent(req.user!, {
            ...body,
            projectUuid,
        });
        return {
            status: 'ok',
            results: agent,
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Patch('/{agentUuid}')
    @OperationId('updateProjectAgent')
    async updateProjectAgent(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Path() agentUuid: string,
        @Body() body: ApiUpdateAiAgent,
    ): Promise<ApiAiAgentResponse> {
        this.setStatus(200);
        const agent = await this.getAiAgentService().updateAgent(
            req.user!,
            agentUuid,
            { ...body, projectUuid },
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
