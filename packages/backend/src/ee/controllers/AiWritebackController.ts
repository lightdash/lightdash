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
import { toSessionUser } from '../../auth/account';
import {
    allowApiKeyAuthentication,
    isAuthenticated,
    unauthorisedInDemo,
} from '../../controllers/authentication';
import { BaseController } from '../../controllers/baseController';
import { AiWritebackService } from '../services/AiWritebackService/AiWritebackService';

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
        if (!body.prompt || body.prompt.trim().length === 0) {
            throw new ParameterError('prompt is required');
        }
        // owner/repo are interpolated into the clone URL, so validate their
        // shape against GitHub's naming rules before use.
        // owner: GitHub account login (1-39 chars, alphanumeric or single
        // hyphens, no leading/trailing hyphen).
        const ownerRegex =
            /^[a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38}$/;
        if (!body.owner || !ownerRegex.test(body.owner)) {
            throw new ParameterError('A valid GitHub owner is required');
        }
        // repo: 1-100 chars, alphanumeric/hyphen/underscore/period, not . or ..
        const repoRegex = /^(?!\.{1,2}$)[a-zA-Z0-9._-]{1,100}$/;
        if (!body.repo || !repoRegex.test(body.repo)) {
            throw new ParameterError(
                'A valid GitHub repository name is required',
            );
        }
        this.setStatus(200);
        const result = await this.getAiWritebackService().run(
            toSessionUser(req.account),
            projectUuid,
            { owner: body.owner, repo: body.repo, prompt: body.prompt },
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
