import {
    ApiErrorPayload,
    assertRegisteredAccount,
    type AiAgentThreadHistoryFilters,
    type AiAgentThreadHistoryScope,
    type ApiAiAgentThreadHistoryListResponse,
    type ApiAiAgentThreadHistorySearchResponse,
    type ApiAiAgentThreadHistoryTranscriptResponse,
} from '@lightdash/common';
import {
    Get,
    Middlewares,
    OperationId,
    Path,
    Query,
    Request,
    Response,
    Route,
    SuccessResponse,
    Tags,
} from '@tsoa/runtime';
import express from 'express';
import { toSessionUser } from '../../auth/account';
import { requireOAuthScopeOperation } from '../../auth/oauthScopes/unchecked';
import {
    allowApiKeyAuthentication,
    isAuthenticated,
} from '../../controllers/authentication';
import { BaseController } from '../../controllers/baseController';
import { type AiAgentThreadHistoryService } from '../services/AiAgentThreadHistoryService';
import { validateDateFilter, validateUuidFilter } from './filterValidation';

@Route('/api/v1/aiAgents/thread-history')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('AI Agents')
export class AiAgentThreadHistoryController extends BaseController {
    private getService(): AiAgentThreadHistoryService {
        return this.services.getAiAgentThreadHistoryService<AiAgentThreadHistoryService>();
    }

    private static getFilters(
        filters: AiAgentThreadHistoryFilters,
    ): AiAgentThreadHistoryFilters {
        validateUuidFilter('projectUuid', [filters.projectUuid ?? []].flat());
        validateUuidFilter('agentUuid', [filters.agentUuid ?? []].flat());
        validateUuidFilter('userUuid', [filters.userUuid ?? []].flat());
        validateDateFilter('dateFrom', filters.dateFrom);
        validateDateFilter('dateTo', filters.dateTo);
        return filters;
    }

    /**
     * List AI agent threads, newest first. The `mine` scope returns your own
     * threads in one project. The `all` scope returns every thread in the
     * projects where you administer AI agents.
     * @summary List AI agent thread history
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        requireOAuthScopeOperation(
            'AiAgentThreadHistoryController.listThreads',
        ),
    ])
    @SuccessResponse('200', 'Success')
    @Get('/threads')
    @OperationId('listAiAgentThreadHistory')
    async listThreads(
        @Request() req: express.Request,
        @Query() scope: AiAgentThreadHistoryScope,
        @Query() projectUuid?: AiAgentThreadHistoryFilters['projectUuid'],
        @Query() agentUuid?: AiAgentThreadHistoryFilters['agentUuid'],
        @Query() userUuid?: AiAgentThreadHistoryFilters['userUuid'],
        @Query() createdFrom?: AiAgentThreadHistoryFilters['createdFrom'],
        @Query() dateFrom?: AiAgentThreadHistoryFilters['dateFrom'],
        @Query() dateTo?: AiAgentThreadHistoryFilters['dateTo'],
        @Query() hasError?: AiAgentThreadHistoryFilters['hasError'],
        @Query() humanScore?: AiAgentThreadHistoryFilters['humanScore'],
        @Query() signal?: AiAgentThreadHistoryFilters['signal'],
        @Query() rootCause?: AiAgentThreadHistoryFilters['rootCause'],
        @Query() cursor?: string,
        @Query() limit?: number,
    ): Promise<ApiAiAgentThreadHistoryListResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.getService().listThreads(
                toSessionUser(req.account),
                {
                    scope,
                    filters: AiAgentThreadHistoryController.getFilters({
                        projectUuid,
                        agentUuid,
                        userUuid,
                        createdFrom,
                        dateFrom,
                        dateTo,
                        hasError,
                        humanScore,
                        signal,
                        rootCause,
                    }),
                    cursor,
                    limit,
                },
            ),
        };
    }

    /**
     * Full-text search over what was asked and answered in AI agent threads,
     * best match first. Takes the same scope and filters as the thread list.
     * Turns written before search was introduced are not searchable; the
     * thread list still returns them.
     * @summary Search AI agent thread history
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        requireOAuthScopeOperation(
            'AiAgentThreadHistoryController.searchThreads',
        ),
    ])
    @SuccessResponse('200', 'Success')
    @Get('/search')
    @OperationId('searchAiAgentThreadHistory')
    async searchThreads(
        @Request() req: express.Request,
        @Query() scope: AiAgentThreadHistoryScope,
        @Query() query: string,
        @Query() projectUuid?: AiAgentThreadHistoryFilters['projectUuid'],
        @Query() agentUuid?: AiAgentThreadHistoryFilters['agentUuid'],
        @Query() userUuid?: AiAgentThreadHistoryFilters['userUuid'],
        @Query() createdFrom?: AiAgentThreadHistoryFilters['createdFrom'],
        @Query() dateFrom?: AiAgentThreadHistoryFilters['dateFrom'],
        @Query() dateTo?: AiAgentThreadHistoryFilters['dateTo'],
        @Query() hasError?: AiAgentThreadHistoryFilters['hasError'],
        @Query() humanScore?: AiAgentThreadHistoryFilters['humanScore'],
        @Query() signal?: AiAgentThreadHistoryFilters['signal'],
        @Query() rootCause?: AiAgentThreadHistoryFilters['rootCause'],
        @Query() cursor?: string,
        @Query() limit?: number,
    ): Promise<ApiAiAgentThreadHistorySearchResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.getService().searchThreads(
                toSessionUser(req.account),
                {
                    scope,
                    query,
                    filters: AiAgentThreadHistoryController.getFilters({
                        projectUuid,
                        agentUuid,
                        userUuid,
                        createdFrom,
                        dateFrom,
                        dateTo,
                        hasError,
                        humanScore,
                        signal,
                        rootCause,
                    }),
                    cursor,
                    limit,
                },
            ),
        };
    }

    /**
     * Read a bounded transcript of one AI agent thread, paged by turn. Long
     * messages are cut, and tool results never include query rows.
     * @summary Get AI agent thread transcript
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        requireOAuthScopeOperation('AiAgentThreadHistoryController.getThread'),
    ])
    @SuccessResponse('200', 'Success')
    @Get('/threads/{threadUuid}')
    @OperationId('getAiAgentThreadHistoryTranscript')
    async getThread(
        @Request() req: express.Request,
        @Path() threadUuid: string,
        @Query() turnOffset?: number,
        @Query() turnLimit?: number,
        @Query() includeToolCalls?: boolean,
    ): Promise<ApiAiAgentThreadHistoryTranscriptResponse> {
        assertRegisteredAccount(req.account);
        validateUuidFilter('threadUuid', [threadUuid]);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.getService().getThread(
                toSessionUser(req.account),
                threadUuid,
                { turnOffset, turnLimit, includeToolCalls },
            ),
        };
    }
}
