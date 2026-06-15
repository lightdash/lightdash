import {
    assertEmbeddedAuth,
    ParameterError,
    type ApiAiAgentThreadCreateRequest,
    type ApiAiAgentThreadMessageCreateRequest,
    type ApiAiAgentThreadStreamRequest,
} from '@lightdash/common';
import * as Sentry from '@sentry/node';
import express, {
    type NextFunction,
    type Request,
    type Response,
    type Router,
} from 'express';
import { isAuthenticated } from '../controllers/authentication';
import { type AiAgentService } from '../ee/services/AiAgentService/AiAgentService';
import Logger from '../logging/logger';

export const embedAiAgentRouter: Router = express.Router({
    mergeParams: true,
});

const getAiAgentService = (req: Request): AiAgentService =>
    req.services.getAiAgentService<AiAgentService>();

const ok = <T>(res: Response, results: T) => {
    res.status(200).json({
        status: 'ok',
        results,
    });
};

const asyncHandler =
    (handler: (req: Request, res: Response) => Promise<void>) =>
    (req: Request, res: Response, next: NextFunction) => {
        handler(req, res).catch(next);
    };

const getChartIndex = (raw: string | undefined) => {
    const chartIndex = Number(raw);
    if (!Number.isInteger(chartIndex) || chartIndex < 0) {
        throw new ParameterError('Chart index must be a non-negative integer');
    }
    return chartIndex;
};

embedAiAgentRouter.use(isAuthenticated);

embedAiAgentRouter.get(
    '/',
    asyncHandler(async (req, res) => {
        assertEmbeddedAuth(req.account);
        ok(
            res,
            await getAiAgentService(req).listEmbedAgents(
                req.account,
                req.params.projectUuid,
            ),
        );
    }),
);

embedAiAgentRouter.get(
    '/:agentUuid',
    asyncHandler(async (req, res) => {
        assertEmbeddedAuth(req.account);
        ok(
            res,
            await getAiAgentService(req).getEmbedAgentDetails(
                req.account,
                req.params.projectUuid,
                req.params.agentUuid,
            ),
        );
    }),
);

embedAiAgentRouter.get(
    '/:agentUuid/models',
    asyncHandler(async (req, res) => {
        assertEmbeddedAuth(req.account);
        ok(
            res,
            await getAiAgentService(req).getEmbedAgentModelOptions(
                req.account,
                req.params.projectUuid,
                req.params.agentUuid,
            ),
        );
    }),
);

embedAiAgentRouter.get(
    '/:agentUuid/suggestions',
    asyncHandler(async (req, res) => {
        assertEmbeddedAuth(req.account);
        await getAiAgentService(req).getEmbedAgentDetails(
            req.account,
            req.params.projectUuid,
            req.params.agentUuid,
        );
        ok(res, { chips: [] });
    }),
);

embedAiAgentRouter.get(
    '/:agentUuid/verified-questions',
    asyncHandler(async (req, res) => {
        assertEmbeddedAuth(req.account);
        ok(
            res,
            await getAiAgentService(req).getEmbedVerifiedQuestions(
                req.account,
                req.params.projectUuid,
                req.params.agentUuid,
            ),
        );
    }),
);

embedAiAgentRouter.get(
    '/:agentUuid/artifacts/:artifactUuid',
    asyncHandler(async (req, res) => {
        assertEmbeddedAuth(req.account);
        ok(
            res,
            await getAiAgentService(req).getEmbedArtifact(
                req.account,
                req.params.projectUuid,
                req.params.agentUuid,
                req.params.artifactUuid,
            ),
        );
    }),
);

embedAiAgentRouter.get(
    '/:agentUuid/artifacts/:artifactUuid/versions/:versionUuid',
    asyncHandler(async (req, res) => {
        assertEmbeddedAuth(req.account);
        ok(
            res,
            await getAiAgentService(req).getEmbedArtifact(
                req.account,
                req.params.projectUuid,
                req.params.agentUuid,
                req.params.artifactUuid,
                req.params.versionUuid,
            ),
        );
    }),
);

embedAiAgentRouter.get(
    '/:agentUuid/artifacts/:artifactUuid/versions/:versionUuid/viz-query',
    asyncHandler(async (req, res) => {
        assertEmbeddedAuth(req.account);
        ok(
            res,
            await getAiAgentService(req).getEmbedArtifactVizQuery(
                req.account,
                req.params.projectUuid,
                req.params.agentUuid,
                req.params.artifactUuid,
                req.params.versionUuid,
            ),
        );
    }),
);

embedAiAgentRouter.get(
    '/:agentUuid/artifacts/:artifactUuid/versions/:versionUuid/charts/:chartIndex/viz-query',
    asyncHandler(async (req, res) => {
        assertEmbeddedAuth(req.account);
        ok(
            res,
            await getAiAgentService(req).getEmbedDashboardArtifactChartVizQuery(
                req.account,
                req.params.projectUuid,
                req.params.agentUuid,
                req.params.artifactUuid,
                req.params.versionUuid,
                getChartIndex(req.params.chartIndex),
            ),
        );
    }),
);

embedAiAgentRouter.get(
    '/:agentUuid/threads/:threadUuid',
    asyncHandler(async (req, res) => {
        assertEmbeddedAuth(req.account);
        ok(
            res,
            await getAiAgentService(req).getEmbedAgentThread(
                req.account,
                req.params.projectUuid,
                req.params.agentUuid,
                req.params.threadUuid,
            ),
        );
    }),
);

embedAiAgentRouter.post(
    '/:agentUuid/threads',
    asyncHandler(async (req, res) => {
        assertEmbeddedAuth(req.account);
        ok(
            res,
            await getAiAgentService(req).createEmbedAgentThread(
                req.account,
                req.params.projectUuid,
                req.params.agentUuid,
                req.body as ApiAiAgentThreadCreateRequest,
            ),
        );
    }),
);

embedAiAgentRouter.post(
    '/:agentUuid/threads/:threadUuid/messages',
    asyncHandler(async (req, res) => {
        assertEmbeddedAuth(req.account);
        ok(
            res,
            await getAiAgentService(req).createEmbedAgentThreadMessage(
                req.account,
                req.params.projectUuid,
                req.params.agentUuid,
                req.params.threadUuid,
                req.body as ApiAiAgentThreadMessageCreateRequest,
            ),
        );
    }),
);

embedAiAgentRouter.patch(
    '/:agentUuid/threads/:threadUuid/messages/:messageUuid/savedQuery',
    asyncHandler(async (req, res) => {
        assertEmbeddedAuth(req.account);
        await getAiAgentService(req).updateEmbedMessageSavedQuery(
            req.account,
            req.params.projectUuid,
            {
                agentUuid: req.params.agentUuid,
                threadUuid: req.params.threadUuid,
                messageUuid: req.params.messageUuid,
                savedQueryUuid:
                    (req.body as { savedQueryUuid: string | null })
                        .savedQueryUuid ?? null,
            },
        );
        ok(res, undefined);
    }),
);

embedAiAgentRouter.post(
    '/:agentUuid/threads/:threadUuid/stream',
    asyncHandler(async (req, res) => {
        assertEmbeddedAuth(req.account);
        const body = req.body as ApiAiAgentThreadStreamRequest | undefined;
        const stream = await getAiAgentService(
            req,
        ).streamEmbedAgentThreadResponse(req.account, req.params.projectUuid, {
            agentUuid: req.params.agentUuid,
            threadUuid: req.params.threadUuid,
            toolHints: body?.toolHints ?? [],
        });

        stream.pipeUIMessageStreamToResponse(res);

        let hasConsumed = false;
        const isStreamTimeoutError = (error: unknown) =>
            error instanceof Error &&
            (error.name === 'BodyTimeoutError' ||
                (error.name === 'TypeError' && error.message === 'terminated'));

        const handleClientDisconnect = (err?: Error) => {
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
                        errorType: 'EmbedAiAgentStreamError',
                    },
                });
            }
            void stream.consumeStream({
                onError: (error) => {
                    Logger.error(`Error consuming stream ${String(error)}`);
                    if (!isStreamTimeoutError(error)) {
                        Sentry.captureException(error, {
                            tags: {
                                errorType: 'EmbedAiAgentStreamError',
                            },
                        });
                    }
                },
            });
        };

        res.on('finish', () => {
            hasConsumed = true;
        });
        res.on('close', handleClientDisconnect);
        res.on('error', handleClientDisconnect);
        req.on('aborted', handleClientDisconnect);
    }),
);
