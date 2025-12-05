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
    ApiAiAgentSummaryResponse,
    ApiAiAgentThreadCreateRequest,
    ApiAiAgentThreadCreateResponse,
    ApiAiAgentThreadGenerateResponse,
    ApiAiAgentThreadGenerateTitleResponse,
    ApiAiAgentThreadMessageCreateRequest,
    ApiAiAgentThreadMessageCreateResponse,
    ApiAiAgentThreadMessageVizQueryResponse,
    ApiAiAgentThreadResponse,
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
import {
    allowApiKeyAuthentication,
    isAuthenticated,
} from '../../controllers/authentication';
import { BaseController } from '../../controllers/baseController';
import Logger from '../../logging/logger';
import { type AiAgentService } from '../services/AiAgentService';

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
        this.setStatus(200);

        return {
            status: 'ok',
            results: await this.getAiAgentService().listAgents(
                req.user!,
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
        this.setStatus(200);

        const userPreferences =
            await this.getAiAgentService().getUserAgentPreferences(
                req.user!,
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
        this.setStatus(200);
        await this.getAiAgentService().updateUserAgentPreferences(
            req.user!,
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
        this.setStatus(200);
        await this.getAiAgentService().deleteUserAgentPreferences(
            req.user!,
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
        this.setStatus(200);
        const agent = await this.getAiAgentService().getAgent(
            req.user!,
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
        this.setStatus(200);
        const models = await this.getAiAgentService().getModelOptions(
            req.user!,
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
        this.setStatus(200);

        const readinessScore = await this.getAiAgentService().evaluateReadiness(
            req.user!,
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
            req.user!,
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
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.getAiAgentService().getVerifiedQuestions(
                req.user!,
                agentUuid,
            ),
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('201', 'Created')
    @Post('/')
    @OperationId('createAgent')
    async createAgent(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Body() body: ApiCreateAiAgent,
    ): Promise<ApiCreateAiAgentResponse> {
        this.setStatus(201);
        const agent = await this.getAiAgentService().createAgent(req.user!, {
            ...body,
            projectUuid,
        });
        return {
            status: 'ok',
            results: agent,
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Patch('/{agentUuid}')
    @OperationId('updateAgent')
    async updateAgent(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Path() agentUuid: string,
        @Body() body: ApiUpdateAiAgent,
    ): Promise<ApiAiAgentResponse> {
        this.setStatus(200);
        const agent = await this.getAiAgentService().updateAgent(
            req.user!,
            agentUuid,
            { ...body, projectUuid },
        );
        return {
            status: 'ok',
            results: agent,
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Delete('/{agentUuid}')
    @OperationId('deleteAgent')
    async deleteAgent(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Path() agentUuid: string,
    ): Promise<ApiSuccessEmpty> {
        this.setStatus(200);
        await this.getAiAgentService().deleteAgent(req.user!, agentUuid);

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
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.getAiAgentService().listAgentThreads(
                req.user!,
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
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.getAiAgentService().getAgentThread(
                req.user!,
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
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.getAiAgentService().createAgentThread(
                req.user!,
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
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.getAiAgentService().createAgentThreadMessage(
                req.user!,
                agentUuid,
                threadUuid,
                body,
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
    ): Promise<void> {
        const stream = await this.getAiAgentService().streamAgentThreadResponse(
            req.user!,
            {
                agentUuid,
                threadUuid,
            },
        );

        /**
         * @ref https://github.com/lukeautry/tsoa/issues/44#issuecomment-357784246
         * Hack to get the response object from the request
         */
        stream.pipeUIMessageStreamToResponse(req.res!);

        // If client disconnects, continue consuming the stream so side-effects complete
        let hasConsumed = false;
        const handleClientDisconnect = (err: Error | undefined) => {
            if (hasConsumed) return;
            hasConsumed = true;
            Logger.info(
                `Client disconnected ${
                    err ? `with error: ${err.message}` : ''
                }, consuming stream`,
            );
            if (err) {
                Sentry.captureException(err, {
                    tags: {
                        errorType: 'AiAgentStreamError',
                    },
                });
            }
            void stream.consumeStream({
                onError: (error) => {
                    Logger.error('Error consuming stream');
                    Sentry.captureException(error, {
                        tags: {
                            errorType: 'AiAgentStreamError',
                        },
                    });
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
        this.setStatus(200);

        const response =
            await this.getAiAgentService().generateAgentThreadResponse(
                req.user!,
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
        this.setStatus(200);

        const title = await this.getAiAgentService().generateThreadTitle(
            req.user!,
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
        this.setStatus(200);

        const clonedThread = await this.getAiAgentService().cloneThread(
            req.user!,
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
        this.setStatus(200);

        await this.getAiAgentService().updateMessageSavedQuery(req.user!, {
            savedQueryUuid: body.savedQueryUuid,
            agentUuid,
            threadUuid,
            messageUuid,
        });

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
        this.setStatus(200);
        await this.getAiAgentService().updateHumanScoreForMessage(
            req.user!,
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
        this.setStatus(200);
        return {
            status: 'ok',
            results:
                await this.getAiAgentService().getAgentExploreAccessSummary(
                    req.user!,
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
        this.setStatus(200);

        return {
            status: 'ok',
            results: (await this.getAiAgentService().getArtifact(
                req.user!,
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
        this.setStatus(200);

        return {
            status: 'ok',
            // Use simplified type for TSOA Compat

            results: (await this.getAiAgentService().getArtifact(
                req.user!,
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
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.getAiAgentService().getArtifactVizQuery(
                req.user!,
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
        this.setStatus(200);
        return {
            status: 'ok',
            results:
                await this.getAiAgentService().getDashboardArtifactChartVizQuery(
                    req.user!,
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
        this.setStatus(200);

        await this.getAiAgentService().updateArtifactVersion(req.user!, {
            agentUuid,
            artifactUuid,
            versionUuid,
            savedDashboardUuid: body.savedDashboardUuid,
        });

        return {
            status: 'ok',
            results: undefined,
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
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
        this.setStatus(200);

        await this.getAiAgentService().setArtifactVersionVerified(req.user!, {
            agentUuid,
            artifactUuid,
            versionUuid,
            verified: body.verified,
        });

        return {
            status: 'ok',
            results: undefined,
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('201', 'Created')
    @Post('/{agentUuid}/evaluations')
    @OperationId('createEvaluation')
    async createEvaluation(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Path() agentUuid: string,
        @Body() body: ApiCreateEvaluationRequest,
    ): Promise<ApiCreateEvaluationResponse> {
        this.setStatus(201);

        const evaluation = await this.getAiAgentService().createEval(
            req.user!,
            projectUuid,
            agentUuid,
            body,
        );

        return {
            status: 'ok',
            results: { evalUuid: evaluation.evalUuid },
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/{agentUuid}/evaluations/{evalUuid}/run')
    @OperationId('runEvaluation')
    async runEvaluation(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Path() agentUuid: string,
        @Path() evalUuid: string,
    ): Promise<ApiAiAgentEvaluationRunResponse> {
        this.setStatus(200);

        const evalRun = await this.getAiAgentService().runEval(
            req.user!,
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
        this.setStatus(200);

        const evaluations = await this.getAiAgentService().getEvalsByAgent(
            req.user!,
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
        this.setStatus(200);

        const evaluation = await this.getAiAgentService().getEval(
            req.user!,
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
        this.setStatus(200);

        const paginateArgs: KnexPaginateArgs | undefined =
            page !== undefined || pageSize !== undefined
                ? {
                      page: page ?? 1,
                      pageSize: pageSize ?? 10,
                  }
                : undefined;

        const runs = await this.getAiAgentService().getEvalRuns(
            req.user!,
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
        this.setStatus(200);

        const runResults = await this.getAiAgentService().getEvalRunWithResults(
            req.user!,
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

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
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
        this.setStatus(200);

        const evaluation = await this.getAiAgentService().updateEval(
            req.user!,
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

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
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
        this.setStatus(200);

        const evaluation = await this.getAiAgentService().appendToEval(
            req.user!,
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

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Delete('/{agentUuid}/evaluations/{evalUuid}')
    @OperationId('deleteEvaluation')
    async deleteEvaluation(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Path() agentUuid: string,
        @Path() evalUuid: string,
    ): Promise<ApiSuccessEmpty> {
        this.setStatus(200);

        await this.getAiAgentService().deleteEval(
            req.user!,
            projectUuid,
            agentUuid,
            evalUuid,
        );

        return {
            status: 'ok',
            results: undefined,
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/{agentUuid}/append-instruction')
    @OperationId('appendInstruction')
    async appendInstruction(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Path() agentUuid: string,
        @Body() body: ApiAppendInstructionRequest,
    ): Promise<ApiAppendInstructionResponse> {
        this.setStatus(200);

        const updatedInstruction =
            await this.getAiAgentService().appendInstruction(
                req.user!,
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

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
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
        this.setStatus(200);

        await this.getAiAgentService().revertChange(req.user!, {
            agentUuid,
            threadUuid,
            promptUuid,
            changeUuid: body.changeUuid,
        });

        return {
            status: 'ok',
            results: undefined,
        };
    }

    protected getAiAgentService() {
        return this.services.getAiAgentService<AiAgentService>();
    }
}
