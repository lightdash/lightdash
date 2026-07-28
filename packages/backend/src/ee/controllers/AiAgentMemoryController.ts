import {
    assertRegisteredAccount,
    type ApiErrorPayload,
    type ApiUpdateAiAgentMemoryStatusRequest,
    type ApiUpdateAiAgentMemoryStatusResponse,
    type UUID,
} from '@lightdash/common';
import {
    Body,
    Middlewares,
    OperationId,
    Patch,
    Path,
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

@Route('/api/v1/projects/{projectUuid}/aiAgentMemories')
@Response<ApiErrorPayload>('default', 'Error')
export class AiAgentMemoryController extends BaseController {
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
}
