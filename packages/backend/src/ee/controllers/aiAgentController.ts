import {
    AiArtifactTSOACompat,
    ApiAiAgentArtifactResponse,
    ApiAiAgentArtifactResponseTSOACompat,
    ApiAiAgentExploreAccessSummaryResponse,
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
    ApiCreateAiAgent,
    ApiCreateAiAgentResponse,
    ApiErrorPayload,
    ApiGetUserAgentPreferencesResponse,
    ApiSuccessEmpty,
    ApiUpdateAiAgent,
    ApiUpdateUserAgentPreferences,
    ApiUpdateUserAgentPreferencesResponse,
} from '@lightdash/common';
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
        stream.pipeDataStreamToResponse(req.res!);
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
        @Body() body: { humanScore: number },
    ): Promise<ApiSuccessEmpty> {
        this.setStatus(200);
        await this.getAiAgentService().updateHumanScoreForMessage(
            req.user!,
            messageUuid,
            body.humanScore,
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
                    req.account!,
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

    protected getAiAgentService() {
        return this.services.getAiAgentService<AiAgentService>();
    }
}
