import {
    assertRegisteredAccount,
    ParameterError,
    type AiWritebackRequestBody,
    type ApiAiWritebackResponse,
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
import { z } from 'zod';
import { toSessionUser } from '../../auth/account';
import {
    allowApiKeyAuthentication,
    isAuthenticated,
    unauthorisedInDemo,
} from '../../controllers/authentication';
import { BaseController } from '../../controllers/baseController';
import { AiWritebackService } from '../services/AiWritebackService/AiWritebackService';

// owner/repo are interpolated into the clone URL, so validate their shape
// against GitHub's naming rules before use.
const aiWritebackBodySchema = z.object({
    // GitHub account login: 1-39 chars, alphanumeric or single internal
    // hyphens, no leading/trailing hyphen.
    owner: z
        .string()
        .regex(
            /^[a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38}$/,
            'A valid GitHub owner is required',
        ),
    // Repository name: 1-100 chars, alphanumeric/hyphen/underscore/period,
    // and not "." or "..".
    repo: z
        .string()
        .regex(
            /^(?!\.{1,2}$)[a-zA-Z0-9._-]{1,100}$/,
            'A valid GitHub repository name is required',
        ),
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
        const { owner, repo, prompt } = parsed.data;
        this.setStatus(200);
        const result = await this.getAiWritebackService().run(
            toSessionUser(req.account),
            projectUuid,
            { owner, repo, prompt },
        );
        return {
            status: 'ok',
            results: result,
        };
    }

    protected getAiWritebackService() {
        return this.services.getAiWritebackService<AiWritebackService>();
    }
}
