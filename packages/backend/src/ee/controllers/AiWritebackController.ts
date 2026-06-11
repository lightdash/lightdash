import {
    assertRegisteredAccount,
    ParameterError,
    type AiWritebackRequestBody,
    type ApiAiWritebackResponse,
    type ApiCiChecksResponse,
    type ApiErrorPayload,
    type ApiProjectCiStatusResponse,
    type ApiProjectFilesResponse,
} from '@lightdash/common';
import {
    Body,
    Get,
    Hidden,
    Middlewares,
    OperationId,
    Path,
    Post,
    Query,
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
import { PreviewDeploySetupService } from '../services/PreviewDeploySetupService/PreviewDeploySetupService';

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
        const results =
            await this.getPreviewDeploySetupService().getProjectCiStatus(
                toSessionUser(req.account),
                projectUuid,
            );
        return {
            status: 'ok',
            results,
        };
    }

    /**
     * Get the live CI status of a write-back pull request — the GitHub Actions
     * check runs on its head branch, mapped onto provider-agnostic states and
     * rolled up to a single overall state. Returns null when CI status can't be
     * resolved (unsupported source control, no app installation, PR not found).
     * @summary Get pull request CI checks
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/ci-checks')
    @OperationId('getPullRequestCiChecks')
    async getPullRequestCiChecks(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Query() prUrl: string,
        @Query() commitSha?: string,
    ): Promise<ApiCiChecksResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        const results = await this.services
            .getCiService()
            .getPullRequestChecks({
                user: toSessionUser(req.account),
                projectUuid,
                prUrl,
                commitSha,
            });
        return {
            status: 'ok',
            results,
        };
    }

    /**
     * List the project's source files (relative to its dbt sub-folder) for the
     * chat input's `@`-mention file picker. Requires view:SourceCode and a
     * GitHub-connected dbt project; the client fetches once and filters locally.
     * @summary List project files
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/project-files')
    @OperationId('listProjectFiles')
    async listProjectFiles(
        @Request() req: express.Request,
        @Path() projectUuid: string,
    ): Promise<ApiProjectFilesResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        const results = await this.getAiWritebackService().listProjectFiles({
            user: toSessionUser(req.account),
            projectUuid,
        });
        return {
            status: 'ok',
            results,
        };
    }

    protected getAiWritebackService() {
        return this.services.getAiWritebackService<AiWritebackService>();
    }

    protected getPreviewDeploySetupService() {
        return this.services.getPreviewDeploySetupService<PreviewDeploySetupService>();
    }
}
