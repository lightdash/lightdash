import {
    AiArtifactTSOACompat,
    ApiAgentReadinessScoreResponse,
    ApiAiAgentArtifactResponseTSOACompat,
    ApiAiAgentEvaluationResponse,
    ApiAiAgentEvaluationRunResponse,
    ApiAiAgentEvaluationRunResultsResponse,
    ApiAiAgentEvaluationRunSummaryListResponse,
    ApiAiAgentEvaluationSummaryListResponse,
    ApiAiAgentExploreAccessSummaryResponse,
    ApiAiAgentModelOptionsResponse,
    ApiAiAgentResponse,
    ApiAiAgentSqlApprovalRequest,
    ApiAiAgentSqlApprovalResponse,
    ApiAiAgentSummaryResponse,
    ApiAiAgentThreadCreateRequest,
    ApiAiAgentThreadCreateResponse,
    ApiAiAgentThreadGenerateResponse,
    ApiAiAgentThreadGenerateTitleResponse,
    ApiAiAgentThreadMessageCreateRequest,
    ApiAiAgentThreadMessageCreateResponse,
    ApiAiAgentThreadMessageVizQueryResponse,
    ApiAiAgentThreadResponse,
    ApiAiAgentThreadStreamRequest,
    ApiAiAgentThreadSummaryListResponse,
    ApiAiAgentVerifiedArtifactsResponse,
    ApiAiAgentVerifiedQuestionsResponse,
    ApiAppendEvaluationRequest,
    ApiAppendInstructionRequest,
    ApiAppendInstructionResponse,
    ApiCloneThreadResponse,
    ApiCreateAiAgent,
    ApiCreateAiAgentResponse,
    ApiCreateEvaluationRequest,
    ApiCreateEvaluationResponse,
    ApiErrorPayload,
    ApiGetUserAgentPreferencesResponse,
    ApiRevertChangeRequest,
    ApiRevertChangeResponse,
    ApiSuccessEmpty,
    ApiUpdateAiAgent,
    ApiUpdateEvaluationRequest,
    ApiUpdateUserAgentPreferences,
    ApiUpdateUserAgentPreferencesResponse,
    assertRegisteredAccount,
    KnexPaginateArgs,
} from '@lightdash/common';
import * as Sentry from '@sentry/node';
import {
    Body,
    Delete,
    Get,
    Hidden,
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
import Logger from '../../logging/logger';
import { type AiAgentService } from '../services/AiAgentService/AiAgentService';

@Route('/api/v1/projects/{projectUuid}/aiAgents')
@Hidden()
@Response<ApiErrorPayload>('default', 'Error')
export class AiAgentController extends BaseController {
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/')
    @OperationId('listAgents')
    async listAgents(
        @Request() req: express.Request,
        @Path() projectUuid: string,
    ): Promise<ApiAiAgentSummaryResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);

        return {
            status: 'ok',
            results: await this.getAiAgentService().listAgents(
                toSessionUser(req.account),
                projectUuid,
            ),
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/preferences')
    @OperationId('getUserAgentPreferences')
    async getUserAgentPreferences(
        @Request() req: express.Request,
        @Path() projectUuid: string,
    ): Promise<ApiGetUserAgentPreferencesResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);

        const userPreferences =
            await this.getAiAgentService().getUserAgentPreferences(
                toSessionUser(req.account),
                projectUuid,
            );
        return {
            status: 'ok',
            results: userPreferences ?? undefined,
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/preferences')
    @OperationId('updateUserAgentPreferences')
    async setUserDefaultAgent(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Body() body: ApiUpdateUserAgentPreferences,
    ): Promise<ApiUpdateUserAgentPreferencesResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        await this.getAiAgentService().updateUserAgentPreferences(
            toSessionUser(req.account),
            projectUuid,
            body,
        );
        return {
            status: 'ok',
            results: undefined,
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Delete('/preferences')
    @OperationId('deleteUserAgentPreferences')
    async deleteUserAgentPreferences(
        @Request() req: express.Request,
        @Path() projectUuid: string,
    ): Promise<ApiSuccessEmpty> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        await this.getAiAgentService().deleteUserAgentPreferences(
            toSessionUser(req.account),
            projectUuid,
        );
        return {
            status: 'ok',
            results: undefined,
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/{agentUuid}')
    @OperationId('getAgent')
    async getAgent(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Path() agentUuid: string,
    ): Promise<ApiAiAgentResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        const agent = await this.getAiAgentService().getAgent(
            toSessionUser(req.account),
            agentUuid,
            projectUuid,
        );
        return {
            status: 'ok',
            results: agent,
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/{agentUuid}/models')
    @OperationId('getModelOptions')
    async getModelOptions(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Path() agentUuid: string,
    ): Promise<ApiAiAgentModelOptionsResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        const models = await this.getAiAgentService().getModelOptions(
            toSessionUser(req.account),
            projectUuid,
            agentUuid,
        );
        return {
            status: 'ok',
            results: models,
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/{agentUuid}/evaluateReadiness')
    @OperationId('evaluateAgentReadiness')
    async evaluateAgentReadiness(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Path() agentUuid: string,
    ): Promise<ApiAgentReadinessScoreResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);

        const readinessScore = await this.getAiAgentService().evaluateReadiness(
            toSessionUser(req.account),
            { agentUuid, projectUuid },
        );

        return {
            status: 'ok',
            results: readinessScore,
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/{agentUuid}/verified-artifacts')
    @OperationId('getVerifiedArtifacts')
    async getVerifiedArtifacts(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Path() agentUuid: string,
        @Query() page?: KnexPaginateArgs['page'],
        @Query() pageSize?: KnexPaginateArgs['pageSize'],
    ): Promise<ApiAiAgentVerifiedArtifactsResponse> {
        assertRegisteredAccount(req.account);
        const paginateArgs: KnexPaginateArgs | undefined =
            page !== undefined || pageSize !== undefined
                ? {
                      page: page ?? 1,
                      pageSize: pageSize ?? 50,
                  }
                : {
                      page: 1,
                      pageSize: 50,
                  };

        const result = await this.getAiAgentService().getVerifiedArtifacts(
            toSessionUser(req.account),
            projectUuid,
            agentUuid,
            paginateArgs,
        );

        this.setStatus(200);
        return {
            status: 'ok',
            results: result,
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/{agentUuid}/verified-questions')
    @OperationId('getVerifiedQuestions')
    async getVerifiedQuestions(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Path() agentUuid: string,
    ): Promise<ApiAiAgentVerifiedQuestionsResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.getAiAgentService().getVerifiedQuestions(
                toSessionUser(req.account),
                agentUuid,
            ),
        };
    }

    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('201', 'Created')
    @Post('/')
    @OperationId('createAgent')
    async createAgent(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Body() body: ApiCreateAiAgent,
    ): Promise<ApiCreateAiAgentResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(201);
        const agent = await this.getAiAgentService().createAgent(
            toSessionUser(req.account),
            {
                ...body,
                projectUuid,
            },
        );
        return {
            status: 'ok',
            results: agent,
        };
    }

    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Patch('/{agentUuid}')
    @OperationId('updateAgent')
    async updateAgent(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Path() agentUuid: string,
        @Body() body: ApiUpdateAiAgent,
    ): Promise<ApiAiAgentResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        const agent = await this.getAiAgentService().updateAgent(
            toSessionUser(req.account),
            agentUuid,
            { ...body, projectUuid },
        );
        return {
            status: 'ok',
            results: agent,
        };
    }

    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Delete('/{agentUuid}')
    @OperationId('deleteAgent')
    async deleteAgent(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Path() agentUuid: string,
    ): Promise<ApiSuccessEmpty> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        await this.getAiAgentService().deleteAgent(
            toSessionUser(req.account),
            agentUuid,
        );

        return {
            status: 'ok',
            results: undefined,
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/{agentUuid}/threads')
    @OperationId('listAgentThreads')
    async listAgentThreads(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Path() agentUuid: string,
        @Query() allUsers?: boolean,
    ): Promise<ApiAiAgentThreadSummaryListResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.getAiAgentService().listAgentThreads(
                toSessionUser(req.account),
                agentUuid,
                allUsers,
            ),
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/{agentUuid}/threads/{threadUuid}')
    @OperationId('getAgentThread')
    async getAgentThread(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Path() agentUuid: string,
        @Path() threadUuid: string,
    ): Promise<ApiAiAgentThreadResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.getAiAgentService().getAgentThread(
                toSessionUser(req.account),
                agentUuid,
                threadUuid,
            ),
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/{agentUuid}/threads')
    @OperationId('createAgentThread')
    async createAgentThread(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Path() agentUuid: string,
        @Body() body: ApiAiAgentThreadCreateRequest,
    ): Promise<ApiAiAgentThreadCreateResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.getAiAgentService().createAgentThread(
                toSessionUser(req.account),
                agentUuid,
                body,
            ),
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/{agentUuid}/threads/{threadUuid}/messages')
    @OperationId('createAgentThreadMessage')
    async createAgentThreadMessage(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Path() agentUuid: string,
        @Path() threadUuid: string,
        @Body() body: ApiAiAgentThreadMessageCreateRequest,
    ): Promise<ApiAiAgentThreadMessageCreateResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.getAiAgentService().createAgentThreadMessage(
                toSessionUser(req.account),
                agentUuid,
                threadUuid,
                body,
            ),
        };
    }

    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Post(
        '/{agentUuid}/threads/{threadUuid}/tool-calls/{toolCallId}/sql-approval',
    )
    @OperationId('decideAgentSqlApproval')
    async decideAgentSqlApproval(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Path() agentUuid: string,
        @Path() threadUuid: string,
        @Path() toolCallId: string,
        @Body() body: ApiAiAgentSqlApprovalRequest,
    ): Promise<ApiAiAgentSqlApprovalResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.getAiAgentService().decideSqlApproval(
                toSessionUser(req.account),
                {
                    agentUuid,
                    threadUuid,
                    toolCallId,
                    decision: body.decision,
                },
            ),
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/{agentUuid}/threads/{threadUuid}/stream')
    @OperationId('streamAgentThreadResponse')
    async streamAgentThreadResponse(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Path() agentUuid: string,
        @Path() threadUuid: string,
        @Body() body?: ApiAiAgentThreadStreamRequest,
    ): Promise<void> {
        assertRegisteredAccount(req.account);
        const stream = await this.getAiAgentService().streamAgentThreadResponse(
            toSessionUser(req.account),
            {
                agentUuid,
                threadUuid,
                enableSqlMode: body?.enableSqlMode ?? false,
            },
        );

        /**
         * @ref https://github.com/lukeautry/tsoa/issues/44#issuecomment-357784246
         * Hack to get the response object from the request
         */
        stream.pipeUIMessageStreamToResponse(req.res!);

        // If client disconnects, continue consuming the stream so side-effects complete
        let hasConsumed = false;
        const isStreamTimeoutError = (error: unknown) =>
            error instanceof Error &&
            (error.name === 'BodyTimeoutError' ||
                (error.name === 'TypeError' && error.message === 'terminated'));

        const handleClientDisconnect = (err: Error | undefined) => {
            if (hasConsumed) return;
            hasConsumed = true;
            Logger.info(
                `Client disconnected ${
                    err ? `with error: ${err.message}` : ''
                }, consuming stream`,
            );
            if (err && !isStreamTimeoutError(err)) {
                Sentry.captureException(err, {
                    tags: {
                        errorType: 'AiAgentStreamError',
                    },
                });
            }
            void stream.consumeStream({
                onError: (error) => {
                    Logger.error(`Error consuming stream ${String(error)}`);
                    if (!isStreamTimeoutError(error)) {
                        Sentry.captureException(error, {
                            tags: {
                                errorType: 'AiAgentStreamError',
                            },
                        });
                    }
                },
            });
        };
        req.res?.on('finish', () => {
            // If the request is finished, we can stop consuming the stream
            hasConsumed = true;
        });
        req.res?.on('close', handleClientDisconnect);
        req.res?.on('error', handleClientDisconnect);
        req.on('aborted', handleClientDisconnect);
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/{agentUuid}/threads/{threadUuid}/generate')
    @OperationId('generateAgentThreadResponse')
    async generateAgentThreadResponse(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Path() agentUuid: string,
        @Path() threadUuid: string,
    ): Promise<ApiAiAgentThreadGenerateResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);

        const response =
            await this.getAiAgentService().generateAgentThreadResponse(
                toSessionUser(req.account),
                {
                    agentUuid,
                    threadUuid,
                },
            );

        return {
            status: 'ok',
            results: {
                response,
            },
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/{agentUuid}/threads/{threadUuid}/generate-title')
    @OperationId('generateAgentThreadTitle')
    async generateAgentThreadTitle(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Path() agentUuid: string,
        @Path() threadUuid: string,
    ): Promise<ApiAiAgentThreadGenerateTitleResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);

        const title = await this.getAiAgentService().generateThreadTitle(
            toSessionUser(req.account),
            {
                agentUuid,
                threadUuid,
            },
        );

        return {
            status: 'ok',
            results: {
                title,
            },
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/{agentUuid}/threads/{threadUuid}/clone/{promptUuid}')
    @OperationId('cloneAgentThread')
    async cloneAgentThread(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Path() agentUuid: string,
        @Path() threadUuid: string,
        @Path() promptUuid: string,
        @Query() createdFrom?: 'web_app' | 'evals',
    ): Promise<ApiCloneThreadResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);

        const clonedThread = await this.getAiAgentService().cloneThread(
            toSessionUser(req.account),
            agentUuid,
            threadUuid,
            promptUuid,
            { createdFrom },
        );

        return {
            status: 'ok',
            results: clonedThread,
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Patch(
        '/{agentUuid}/threads/{threadUuid}/messages/{messageUuid}/savedQuery',
    )
    @OperationId('updateAgentThreadMessageSavedQuery')
    async updateAgentThreadMessageSavedQuery(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Path() agentUuid: string,
        @Path() threadUuid: string,
        @Path() messageUuid: string,
        @Body() body: { savedQueryUuid: string | null },
    ): Promise<ApiSuccessEmpty> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);

        await this.getAiAgentService().updateMessageSavedQuery(
            toSessionUser(req.account),
            {
                savedQueryUuid: body.savedQueryUuid,
                agentUuid,
                threadUuid,
                messageUuid,
            },
        );

        return {
            status: 'ok',
            results: undefined,
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Patch('/{agentUuid}/threads/{threadUuid}/messages/{messageUuid}/feedback')
    @OperationId('updatePromptFeedback')
    async updatePromptFeedback(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Path() agentUuid: string,
        @Path() threadUuid: string,
        @Path() messageUuid: string,
        @Body() body: { humanScore: number; humanFeedback?: string | null },
    ): Promise<ApiSuccessEmpty> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        await this.getAiAgentService().updateHumanScoreForMessage(
            toSessionUser(req.account),
            projectUuid,
            agentUuid,
            threadUuid,
            messageUuid,
            body.humanScore,
            body.humanFeedback,
        );
        return {
            status: 'ok',
            results: undefined,
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/explore-access-summary')
    @OperationId('getAgentExploreAccessSummary')
    async getAgentExploreAccessSummary(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Body() body: { tags: string[] | null },
    ): Promise<ApiAiAgentExploreAccessSummaryResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results:
                await this.getAiAgentService().getAgentExploreAccessSummary(
                    toSessionUser(req.account),
                    projectUuid,
                    body.tags,
                ),
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/{agentUuid}/artifacts/{artifactUuid}')
    @OperationId('getArtifact')
    async getArtifact(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Path() agentUuid: string,
        @Path() artifactUuid: string,
    ): Promise<ApiAiAgentArtifactResponseTSOACompat> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);

        return {
            status: 'ok',
            results: (await this.getAiAgentService().getArtifact(
                toSessionUser(req.account),
                projectUuid,
                agentUuid,
                artifactUuid,
            )) as unknown as AiArtifactTSOACompat,
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/{agentUuid}/artifacts/{artifactUuid}/versions/{versionUuid}')
    @OperationId('getArtifactVersion')
    async getArtifactVersion(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Path() agentUuid: string,
        @Path() artifactUuid: string,
        @Path() versionUuid: string,
    ): Promise<ApiAiAgentArtifactResponseTSOACompat> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);

        return {
            status: 'ok',
            // Use simplified type for TSOA Compat

            results: (await this.getAiAgentService().getArtifact(
                toSessionUser(req.account),
                projectUuid,
                agentUuid,
                artifactUuid,
                versionUuid,
            )) as unknown as AiArtifactTSOACompat,
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get(
        '/{agentUuid}/artifacts/{artifactUuid}/versions/{versionUuid}/viz-query',
    )
    @OperationId('getArtifactVizQuery')
    async getArtifactVizQuery(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Path() agentUuid: string,
        @Path() artifactUuid: string,
        @Path() versionUuid: string,
    ): Promise<ApiAiAgentThreadMessageVizQueryResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.getAiAgentService().getArtifactVizQuery(
                toSessionUser(req.account),
                {
                    projectUuid,
                    agentUuid,
                    artifactUuid,
                    versionUuid,
                },
            ),
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get(
        '/{agentUuid}/artifacts/{artifactUuid}/versions/{versionUuid}/charts/{chartIndex}/viz-query',
    )
    @OperationId('getDashboardArtifactChartVizQuery')
    async getDashboardArtifactChartVizQuery(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Path() agentUuid: string,
        @Path() artifactUuid: string,
        @Path() versionUuid: string,
        @Path() chartIndex: number,
    ): Promise<ApiAiAgentThreadMessageVizQueryResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results:
                await this.getAiAgentService().getDashboardArtifactChartVizQuery(
                    toSessionUser(req.account),
                    {
                        projectUuid,
                        agentUuid,
                        artifactUuid,
                        versionUuid,
                        chartIndex,
                    },
                ),
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Patch(
        '/{agentUuid}/artifacts/{artifactUuid}/versions/{versionUuid}/savedDashboard',
    )
    @OperationId('updateArtifactVersionSavedDashboard')
    async updateArtifactVersionSavedDashboard(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Path() agentUuid: string,
        @Path() artifactUuid: string,
        @Path() versionUuid: string,
        @Body() body: { savedDashboardUuid: string | null },
    ): Promise<ApiSuccessEmpty> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);

        await this.getAiAgentService().updateArtifactVersion(
            toSessionUser(req.account),
            {
                agentUuid,
                artifactUuid,
                versionUuid,
                savedDashboardUuid: body.savedDashboardUuid,
            },
        );

        return {
            status: 'ok',
            results: undefined,
        };
    }

    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Patch(
        '/{agentUuid}/artifacts/{artifactUuid}/versions/{versionUuid}/verified',
    )
    @OperationId('setArtifactVersionVerified')
    async setArtifactVersionVerified(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Path() agentUuid: string,
        @Path() artifactUuid: string,
        @Path() versionUuid: string,
        @Body() body: { verified: boolean },
    ): Promise<ApiSuccessEmpty> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);

        await this.getAiAgentService().setArtifactVersionVerified(
            toSessionUser(req.account),
            {
                agentUuid,
                artifactUuid,
                versionUuid,
                verified: body.verified,
            },
        );

        return {
            status: 'ok',
            results: undefined,
        };
    }

    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('201', 'Created')
    @Post('/{agentUuid}/evaluations')
    @OperationId('createEvaluation')
    async createEvaluation(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Path() agentUuid: string,
        @Body() body: ApiCreateEvaluationRequest,
    ): Promise<ApiCreateEvaluationResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(201);

        const evaluation = await this.getAiAgentService().createEval(
            toSessionUser(req.account),
            projectUuid,
            agentUuid,
            body,
        );

        return {
            status: 'ok',
            results: { evalUuid: evaluation.evalUuid },
        };
    }

    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Post('/{agentUuid}/evaluations/{evalUuid}/run')
    @OperationId('runEvaluation')
    async runEvaluation(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Path() agentUuid: string,
        @Path() evalUuid: string,
    ): Promise<ApiAiAgentEvaluationRunResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);

        const evalRun = await this.getAiAgentService().runEval(
            toSessionUser(req.account),
            projectUuid,
            agentUuid,
            evalUuid,
        );

        return {
            status: 'ok',
            results: evalRun,
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/{agentUuid}/evaluations')
    @OperationId('getEvaluations')
    async getEvaluations(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Path() agentUuid: string,
    ): Promise<ApiAiAgentEvaluationSummaryListResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);

        const evaluations = await this.getAiAgentService().getEvalsByAgent(
            toSessionUser(req.account),
            projectUuid,
            agentUuid,
        );

        return {
            status: 'ok',
            results: evaluations,
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/{agentUuid}/evaluations/{evalUuid}')
    @OperationId('getEvaluation')
    async getEvaluation(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Path() agentUuid: string,
        @Path() evalUuid: string,
    ): Promise<ApiAiAgentEvaluationResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);

        const evaluation = await this.getAiAgentService().getEval(
            toSessionUser(req.account),
            projectUuid,
            agentUuid,
            evalUuid,
        );

        return {
            status: 'ok',
            results: evaluation,
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/{agentUuid}/evaluations/{evalUuid}/runs')
    @OperationId('getEvaluationRuns')
    async getEvaluationRuns(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Path() agentUuid: string,
        @Path() evalUuid: string,
        @Query() page?: KnexPaginateArgs['page'],
        @Query() pageSize?: KnexPaginateArgs['pageSize'],
    ): Promise<ApiAiAgentEvaluationRunSummaryListResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);

        const paginateArgs: KnexPaginateArgs | undefined =
            page !== undefined || pageSize !== undefined
                ? {
                      page: page ?? 1,
                      pageSize: pageSize ?? 10,
                  }
                : undefined;

        const runs = await this.getAiAgentService().getEvalRuns(
            toSessionUser(req.account),
            projectUuid,
            agentUuid,
            evalUuid,
            paginateArgs,
        );

        return {
            status: 'ok',
            results: runs,
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/{agentUuid}/evaluations/{evalUuid}/runs/{runUuid}')
    @OperationId('getEvaluationRunResults')
    async getEvaluationRunResults(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Path() agentUuid: string,
        @Path() evalUuid: string,
        @Path() runUuid: string,
    ): Promise<ApiAiAgentEvaluationRunResultsResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);

        const runResults = await this.getAiAgentService().getEvalRunWithResults(
            toSessionUser(req.account),
            projectUuid,
            agentUuid,
            evalUuid,
            runUuid,
        );

        return {
            status: 'ok',
            results: runResults,
        };
    }

    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Patch('/{agentUuid}/evaluations/{evalUuid}')
    @OperationId('updateEvaluation')
    async updateEvaluation(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Path() agentUuid: string,
        @Path() evalUuid: string,
        @Body()
        body: ApiUpdateEvaluationRequest,
    ): Promise<ApiAiAgentEvaluationResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);

        const evaluation = await this.getAiAgentService().updateEval(
            toSessionUser(req.account),
            projectUuid,
            agentUuid,
            evalUuid,
            body,
        );

        return {
            status: 'ok',
            results: evaluation,
        };
    }

    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Post('/{agentUuid}/evaluations/{evalUuid}/append')
    @OperationId('appendToEvaluation')
    async appendToEvaluation(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Path() agentUuid: string,
        @Path() evalUuid: string,
        @Body() body: ApiAppendEvaluationRequest,
    ): Promise<ApiAiAgentEvaluationResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);

        const evaluation = await this.getAiAgentService().appendToEval(
            toSessionUser(req.account),
            projectUuid,
            agentUuid,
            evalUuid,
            body,
        );

        return {
            status: 'ok',
            results: evaluation,
        };
    }

    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Delete('/{agentUuid}/evaluations/{evalUuid}')
    @OperationId('deleteEvaluation')
    async deleteEvaluation(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Path() agentUuid: string,
        @Path() evalUuid: string,
    ): Promise<ApiSuccessEmpty> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);

        await this.getAiAgentService().deleteEval(
            toSessionUser(req.account),
            projectUuid,
            agentUuid,
            evalUuid,
        );

        return {
            status: 'ok',
            results: undefined,
        };
    }

    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Post('/{agentUuid}/append-instruction')
    @OperationId('appendInstruction')
    async appendInstruction(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Path() agentUuid: string,
        @Body() body: ApiAppendInstructionRequest,
    ): Promise<ApiAppendInstructionResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);

        const updatedInstruction =
            await this.getAiAgentService().appendInstruction(
                toSessionUser(req.account),
                projectUuid,
                agentUuid,
                body.instruction,
            );

        return {
            status: 'ok',
            results: {
                updatedInstruction,
            },
        };
    }

    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Post(
        '/{agentUuid}/threads/{threadUuid}/messages/{promptUuid}/revert-change',
    )
    @OperationId('revertChange')
    async revertChange(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Path() agentUuid: string,
        @Path() threadUuid: string,
        @Path() promptUuid: string,
        @Body() body: ApiRevertChangeRequest,
    ): Promise<ApiRevertChangeResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);

        await this.getAiAgentService().revertChange(
            toSessionUser(req.account),
            {
                agentUuid,
                threadUuid,
                promptUuid,
                changeUuid: body.changeUuid,
            },
        );

        return {
            status: 'ok',
            results: undefined,
        };
    }

    protected getAiAgentService() {
        return this.services.getAiAgentService<AiAgentService>();
    }
}
