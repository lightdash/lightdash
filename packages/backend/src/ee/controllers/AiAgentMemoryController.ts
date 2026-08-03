import {
    assertRegisteredAccount,
    type ApiAiAgentMemoryResponse,
    type ApiAiAgentUserMemoriesResponse,
    type ApiErrorPayload,
    type ApiTriggerAiAgentMemoryDistillResponse,
    type ApiUpdateAiAgentMemoryStatusRequest,
    type ApiUpdateAiAgentMemoryStatusResponse,
    type KnexPaginateArgs,
    type UUID,
} from '@lightdash/common';
import {
    Body,
    Get,
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
import { toSessionUser } from '../../auth/account';
import {
    allowApiKeyAuthentication,
    isAuthenticated,
    unauthorisedInDemo,
} from '../../controllers/authentication';
import { BaseController } from '../../controllers/baseController';
import { type AiAgentMemoryService } from '../services/AiAgentMemoryService/AiAgentMemoryService';

const AI_AGENT_MEMORIES_DEFAULT_PAGE_SIZE = 50;
const AI_AGENT_MEMORIES_MAX_PAGE_SIZE = 100;

@Route('/api/v1/projects/{projectUuid}/aiAgentMemories')
@Response<ApiErrorPayload>('default', 'Error')
export class AiAgentMemoryController extends BaseController {
    /**
     * Lists the active memories the AI agents saved from the requesting user's
     * own threads in this project. The owner is always the session user.
     * @summary List my memories
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/')
    @OperationId('getMyAiAgentMemories')
    async getMyAiAgentMemories(
        @Request() req: express.Request,
        @Path() projectUuid: UUID,
        @Query() page?: KnexPaginateArgs['page'],
        @Query() pageSize?: KnexPaginateArgs['pageSize'],
    ): Promise<ApiAiAgentUserMemoriesResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);

        const results = await this.services
            .getAiAgentMemoryService<AiAgentMemoryService>()
            .listMyMemories(toSessionUser(req.account), projectUuid, {
                page: page ?? 1,
                pageSize: Math.min(
                    pageSize ?? AI_AGENT_MEMORIES_DEFAULT_PAGE_SIZE,
                    AI_AGENT_MEMORIES_MAX_PAGE_SIZE,
                ),
            });

        return { status: 'ok', results };
    }

    /**
     * Returns one memory the requesting user can read, without going through an
     * agent: memories consolidated across agents have no agent to route by.
     * @summary Get a memory
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/{slug}')
    @OperationId('getAiAgentMemoryBySlug')
    async getAiAgentMemoryBySlug(
        @Request() req: express.Request,
        @Path() projectUuid: UUID,
        @Path() slug: string,
    ): Promise<ApiAiAgentMemoryResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);

        return {
            status: 'ok',
            results: await this.services
                .getAiAgentMemoryService<AiAgentMemoryService>()
                .getMemory(toSessionUser(req.account), projectUuid, slug),
        };
    }

    /**
     * Changes whether a memory is available to the AI agent.
     * @summary Update memory status
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Patch('/{memoryUuid}/status')
    @OperationId('updateAiAgentMemoryStatus')
    async updateAiAgentMemoryStatus(
        @Request() req: express.Request,
        @Path() projectUuid: UUID,
        @Path() memoryUuid: UUID,
        @Body() body: ApiUpdateAiAgentMemoryStatusRequest,
    ): Promise<ApiUpdateAiAgentMemoryStatusResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);

        await this.services
            .getAiAgentMemoryService<AiAgentMemoryService>()
            .updateMemoryStatus(
                toSessionUser(req.account),
                projectUuid,
                memoryUuid,
                body.status,
            );

        return { status: 'ok', results: undefined };
    }

    /**
     * Queues distillation for one thread immediately, skipping the 6h idle wait
     * and the every-3h sweep. Re-distills a thread that is already up to date.
     * Requires permission to manage AI agents in the project.
     * @summary Distill thread
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('202', 'Accepted')
    @Post('/threads/{threadUuid}/distill')
    @OperationId('triggerAiAgentMemoryDistill')
    async triggerAiAgentMemoryDistill(
        @Request() req: express.Request,
        @Path() projectUuid: UUID,
        @Path() threadUuid: UUID,
    ): Promise<ApiTriggerAiAgentMemoryDistillResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(202);

        return {
            status: 'ok',
            results: await this.services
                .getAiAgentMemoryService<AiAgentMemoryService>()
                .triggerThreadDistill(
                    toSessionUser(req.account),
                    projectUuid,
                    threadUuid,
                ),
        };
    }
}
