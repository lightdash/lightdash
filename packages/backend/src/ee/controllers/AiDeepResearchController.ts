import {
    assertRegisteredAccount,
    ForbiddenError,
    type AiDeepResearchRequestBody,
    type ApiAiAgentThreadMessageVizQueryResponse,
    type ApiAiDeepResearchEventsResponse,
    type ApiAiDeepResearchRunListResponse,
    type ApiAiDeepResearchRunResponse,
    type ApiErrorPayload,
    type UUID,
} from '@lightdash/common';
import {
    Body,
    Get,
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
import { toSessionUser } from '../../auth/account';
import {
    allowApiKeyAuthentication,
    isAuthenticated,
    unauthorisedInDemo,
} from '../../controllers/authentication';
import { BaseController } from '../../controllers/baseController';
import { AiDeepResearchService } from '../services/AiDeepResearchService/AiDeepResearchService';

@Route('/api/v1/ee/projects/{projectUuid}/ai-deep-research')
@Response<ApiErrorPayload>('default', 'Error')
export class AiDeepResearchController extends BaseController {
    /**
     * Start a durable Deep Research investigation.
     * @summary Start Deep Research run
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('202', 'Accepted')
    @Post('/')
    @OperationId('createAiDeepResearchRun')
    async createRun(
        @Request() req: express.Request,
        @Path() projectUuid: UUID,
        @Body() body: AiDeepResearchRequestBody,
    ): Promise<ApiAiDeepResearchRunResponse> {
        assertRegisteredAccount(req.account);
        if (req.account.authentication.type !== 'session') {
            throw new ForbiddenError(
                'Deep Research must be started from a signed-in browser session',
            );
        }
        this.setStatus(202);
        return {
            status: 'ok',
            results: await this.getAiDeepResearchService().createRun({
                user: toSessionUser(req.account),
                projectUuid,
                prompt: body.prompt,
                agentUuid: body.agentUuid,
                effort: body.effort,
                aiThreadUuid: body.threadUuid,
                promptUuid: body.promptUuid,
                mcpServerUuids: body.mcpServerUuids,
            }),
        };
    }

    /**
     * List the caller's Deep Research runs attached to an agent thread.
     * @summary List Deep Research runs
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/')
    @OperationId('listAiDeepResearchRuns')
    async listRuns(
        @Request() req: express.Request,
        @Path() projectUuid: UUID,
        @Query() threadUuid: UUID,
    ): Promise<ApiAiDeepResearchRunListResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.getAiDeepResearchService().listRunsForThread(
                toSessionUser(req.account),
                projectUuid,
                threadUuid,
            ),
        };
    }

    /**
     * Get the durable state and result of a Deep Research run.
     * @summary Get Deep Research run
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/{aiDeepResearchRunUuid}')
    @OperationId('getAiDeepResearchRun')
    async getRun(
        @Request() req: express.Request,
        @Path() projectUuid: UUID,
        @Path() aiDeepResearchRunUuid: UUID,
    ): Promise<ApiAiDeepResearchRunResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.getAiDeepResearchService().getRun(
                toSessionUser(req.account),
                projectUuid,
                aiDeepResearchRunUuid,
            ),
        };
    }

    /**
     * Re-execute the metric query behind a warehouse-backed report chart to
     * load its live results instead of the persisted snapshot.
     * @summary Refresh Deep Research chart
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/{aiDeepResearchRunUuid}/charts/{chartKey}/refresh')
    @OperationId('refreshAiDeepResearchChart')
    async refreshChart(
        @Request() req: express.Request,
        @Path() projectUuid: UUID,
        @Path() aiDeepResearchRunUuid: UUID,
        @Path() chartKey: string,
    ): Promise<ApiAiAgentThreadMessageVizQueryResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.getAiDeepResearchService().refreshChart({
                account: req.account,
                user: toSessionUser(req.account),
                projectUuid,
                aiDeepResearchRunUuid,
                chartKey,
            }),
        };
    }

    /**
     * List persisted progress for a Deep Research run in chronological order.
     * Pass the returned cursor unchanged to receive only newer events. The
     * cursor remains usable when no new events are available.
     * @summary List Deep Research events
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/{aiDeepResearchRunUuid}/events')
    @OperationId('listAiDeepResearchEvents')
    async listEvents(
        @Request() req: express.Request,
        @Path() projectUuid: UUID,
        @Path() aiDeepResearchRunUuid: UUID,
        @Query() cursor?: string,
        @Query() limit?: number,
    ): Promise<ApiAiDeepResearchEventsResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.getAiDeepResearchService().listEvents({
                user: toSessionUser(req.account),
                projectUuid,
                aiDeepResearchRunUuid,
                cursor,
                limit,
            }),
        };
    }

    /**
     * Cancel a queued run immediately or request cancellation for a running run.
     * @summary Cancel Deep Research run
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/{aiDeepResearchRunUuid}/cancel')
    @OperationId('cancelAiDeepResearchRun')
    async cancelRun(
        @Request() req: express.Request,
        @Path() projectUuid: UUID,
        @Path() aiDeepResearchRunUuid: UUID,
    ): Promise<ApiAiDeepResearchRunResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.getAiDeepResearchService().cancelRun(
                toSessionUser(req.account),
                projectUuid,
                aiDeepResearchRunUuid,
            ),
        };
    }

    protected getAiDeepResearchService() {
        return this.services.getAiDeepResearchService<AiDeepResearchService>();
    }
}
