import {
    assertRegisteredAccount,
    ParameterError,
    type AgenticWritebackRequestBody,
    type ApiAgenticWritebackResponse,
    type ApiErrorPayload,
} from '@lightdash/common';
import {
    Body,
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
import { toSessionUser } from '../../auth/account';
import {
    allowApiKeyAuthentication,
    isAuthenticated,
    unauthorisedInDemo,
} from '../../controllers/authentication';
import { BaseController } from '../../controllers/baseController';
import { AgenticWritebackService } from '../services/AgenticWritebackService/AgenticWritebackService';

@Route('/api/v1/ee/projects/{projectUuid}/agentic-writeback')
@Hidden()
@Response<ApiErrorPayload>('default', 'Error')
export class AgenticWritebackController extends BaseController {
    /**
     * Run an agentic writeback prompt. Spins up an isolated sandbox, executes
     * the prompt with the Claude Code CLI, and returns the agent's output.
     * Synchronous — the request is held open until the run completes.
     *
     * In progress: gated behind the `agentic-writeback` feature flag, which
     * is off by default.
     * @summary Run an agentic writeback prompt
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Post('/')
    @OperationId('runAgenticWriteback')
    async runAgenticWriteback(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Body() body: AgenticWritebackRequestBody,
    ): Promise<ApiAgenticWritebackResponse> {
        assertRegisteredAccount(req.account);
        if (!body.prompt || body.prompt.trim().length === 0) {
            throw new ParameterError('prompt is required');
        }
        this.setStatus(200);
        const result = await this.getAgenticWritebackService().run(
            toSessionUser(req.account),
            projectUuid,
            body.prompt,
        );
        return {
            status: 'ok',
            results: result,
        };
    }

    protected getAgenticWritebackService() {
        return this.services.getAgenticWritebackService<AgenticWritebackService>();
    }
}
