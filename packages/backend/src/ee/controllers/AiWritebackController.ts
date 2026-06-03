import {
    assertRegisteredAccount,
    ParameterError,
    type AiWritebackRequestBody,
    type ApiAiWritebackResponse,
    type ApiErrorPayload,
    type ApiProjectCiStatusResponse,
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
import { z } from 'zod';
import { toSessionUser } from '../../auth/account';
import {
    allowApiKeyAuthentication,
    isAuthenticated,
    unauthorisedInDemo,
} from '../../controllers/authentication';
import { BaseController } from '../../controllers/baseController';
import { AiWritebackService } from '../services/AiWritebackService/AiWritebackService';

// The target repo (owner/repo) and dbt sub-folder are resolved server-side from
// the project's dbt connection, so the body only carries the prompt.
const aiWritebackBodySchema = z.object({
    prompt: z.string().trim().min(1, 'prompt is required'),
});

@Route('/api/v1/ee/projects/{projectUuid}/ai-writeback')
@Hidden()
@Response<ApiErrorPayload>('default', 'Error')
export class AiWritebackController extends BaseController {
    /**
     * Run an AI writeback prompt. Spins up an isolated sandbox, executes
     * the prompt with the Claude Code CLI, and returns the agent's output.
     * Synchronous — the request is held open until the run completes.
     *
     * In progress: gated behind the `ai-writeback` feature flag, which
     * is off by default.
     * @summary Run an AI writeback prompt
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Post('/')
    @OperationId('runAiWriteback')
    async runAiWriteback(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Body() body: AiWritebackRequestBody,
    ): Promise<ApiAiWritebackResponse> {
        assertRegisteredAccount(req.account);
        const parsed = aiWritebackBodySchema.safeParse(body);
        if (!parsed.success) {
            throw new ParameterError(
                parsed.error.errors[0]?.message ?? 'Invalid request parameters',
            );
        }
        const { prompt } = parsed.data;
        this.setStatus(200);
        const result = await this.getAiWritebackService().run({
            user: toSessionUser(req.account),
            projectUuid,
            prompt,
            source: 'api',
        });
        return {
            status: 'ok',
            results: result,
        };
    }

    /**
     * Get the project's CI status — whether its repo has a Lightdash
     * preview-deploy workflow. Lets the chat UI decide whether a write-back PR
     * will produce a preview deployment. Returns null when never scanned.
     * @summary Get project CI status
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/ci-status')
    @OperationId('getProjectCiStatus')
    async getProjectCiStatus(
        @Request() req: express.Request,
        @Path() projectUuid: string,
    ): Promise<ApiProjectCiStatusResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        const results = await this.getAiWritebackService().getProjectCiStatus(
            toSessionUser(req.account),
            projectUuid,
        );
        return {
            status: 'ok',
            results,
        };
    }

    protected getAiWritebackService() {
        return this.services.getAiWritebackService<AiWritebackService>();
    }
}
