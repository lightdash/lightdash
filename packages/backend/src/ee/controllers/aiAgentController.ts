import {
    ApiAiAgentResponse,
    ApiAiAgentSummaryResponse,
    ApiAiAgentThreadResponse,
    ApiAiAgentThreadSummaryListResponse,
    ApiCreateAiAgent,
    ApiCreateAiAgentResponse,
    ApiErrorPayload,
    ApiUpdateAiAgent,
    NotImplementedError,
} from '@lightdash/common';
import {
    Body,
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
        throw new NotImplementedError('List agents not implemented');
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
        throw new NotImplementedError('Get agent not implemented');
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('201', 'Created')
    @Post('/')
    @OperationId('createAgent')
    async createAgent(
        @Request() req: express.Request,
        @Body() body: ApiCreateAiAgent,
    ): Promise<ApiCreateAiAgentResponse> {
        this.setStatus(200);
        throw new NotImplementedError('Create agent not implemented');
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
        throw new NotImplementedError('Update agent not implemented');
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
        throw new NotImplementedError('Update agent not implemented');
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
        throw new NotImplementedError('Update agent not implemented');
    }

    protected getAiAgentService() {
        return this.services.getAiAgentService<AiAgentService>();
    }
}
