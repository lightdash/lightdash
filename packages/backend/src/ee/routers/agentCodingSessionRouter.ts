import {
    ApiAgentCodingSessionListResponse,
    ApiAgentCodingSessionResponse,
    CreateAgentCodingSessionRequest,
    SendAgentCodingSessionMessageRequest,
} from '@lightdash/common';
import express, { NextFunction, Request, Response, Router } from 'express';
import {
    allowApiKeyAuthentication,
    isAuthenticated,
    unauthorisedInDemo,
} from '../../controllers/authentication';
import { AgentCodingSessionService } from '../services/AgentCodingSessionService';

export const agentCodingSessionRouter: Router = express.Router({
    mergeParams: true,
});

// Helper to get service
const getService = (req: Request): AgentCodingSessionService =>
    req.services.getAgentCodingSessionService<AgentCodingSessionService>();

// List sessions
agentCodingSessionRouter.get(
    '/',
    allowApiKeyAuthentication,
    isAuthenticated,
    async (req: Request, res: Response, next) => {
        try {
            const { projectUuid } = req.params;
            const sessions = await getService(req).listSessions(
                req.user!,
                projectUuid,
            );
            const response: ApiAgentCodingSessionListResponse = {
                status: 'ok',
                results: sessions,
            };
            res.json(response);
        } catch (e) {
            next(e);
        }
    },
);

// Create session
agentCodingSessionRouter.post(
    '/',
    allowApiKeyAuthentication,
    isAuthenticated,
    unauthorisedInDemo,
    async (req: Request, res: Response, next) => {
        try {
            const { projectUuid } = req.params;
            const { prompt, githubBranch } =
                req.body as CreateAgentCodingSessionRequest;

            const session = await getService(req).createSession(
                req.user!,
                projectUuid,
                prompt,
                githubBranch,
            );

            const response: ApiAgentCodingSessionResponse = {
                status: 'ok',
                results: session,
            };
            res.status(201).json(response);
        } catch (e) {
            next(e);
        }
    },
);

// Get session
agentCodingSessionRouter.get(
    '/:sessionUuid',
    allowApiKeyAuthentication,
    isAuthenticated,
    async (req: Request, res: Response, next) => {
        try {
            const { sessionUuid } = req.params;
            const session = await getService(req).getSession(
                req.user!,
                sessionUuid,
            );

            const response: ApiAgentCodingSessionResponse = {
                status: 'ok',
                results: session,
            };
            res.json(response);
        } catch (e) {
            next(e);
        }
    },
);

// Get session messages
agentCodingSessionRouter.get(
    '/:sessionUuid/messages',
    allowApiKeyAuthentication,
    isAuthenticated,
    async (req: Request, res: Response, next) => {
        try {
            const { sessionUuid } = req.params;
            const messages = await getService(req).getSessionMessages(
                req.user!,
                sessionUuid,
            );

            res.json({
                status: 'ok',
                results: messages,
            });
        } catch (e) {
            next(e);
        }
    },
);

// Stream session response (SSE)
// Supports reconnection via ?lastEventId=N query parameter
agentCodingSessionRouter.get(
    '/:sessionUuid/stream',
    allowApiKeyAuthentication,
    isAuthenticated,
    async (req: Request, res: Response) => {
        const { sessionUuid } = req.params;
        const lastEventId = parseInt(req.query.lastEventId as string, 10) || 0;

        // Set SSE headers
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.flushHeaders();

        // Heartbeat to keep connection alive
        const heartbeat = setInterval(() => {
            res.write('event: heartbeat\ndata: {}\n\n');
        }, 30000);

        const abortController = new AbortController();

        // Cleanup on close
        const cleanup = () => {
            clearInterval(heartbeat);
            abortController.abort();
        };
        req.on('close', cleanup);
        req.on('error', cleanup);

        try {
            await getService(req).streamSession(
                req.user!,
                sessionUuid,
                lastEventId,
                (event) => {
                    // Include eventId as SSE id for reconnection
                    res.write(`id: ${event.eventId}\n`);
                    res.write(`event: ${event.event.type}\n`);
                    res.write(`data: ${JSON.stringify(event.event)}\n\n`);
                },
                abortController.signal,
            );
        } catch (error) {
            const errorMessage =
                error instanceof Error ? error.message : 'Unknown error';
            res.write(`event: error\ndata: ${JSON.stringify({ type: 'error', error: errorMessage })}\n\n`);
        } finally {
            cleanup();
            res.end();
        }
    },
);

// Send follow-up message
agentCodingSessionRouter.post(
    '/:sessionUuid/messages',
    allowApiKeyAuthentication,
    isAuthenticated,
    unauthorisedInDemo,
    async (req: Request, res: Response, next) => {
        try {
            const { sessionUuid } = req.params;
            const { prompt } = req.body as SendAgentCodingSessionMessageRequest;

            const message = await getService(req).sendMessage(
                req.user!,
                sessionUuid,
                prompt,
            );

            res.status(201).json({
                status: 'ok',
                results: message,
            });
        } catch (e) {
            next(e);
        }
    },
);

// Delete session
agentCodingSessionRouter.delete(
    '/:sessionUuid',
    allowApiKeyAuthentication,
    isAuthenticated,
    unauthorisedInDemo,
    async (req: Request, res: Response, next) => {
        try {
            const { sessionUuid } = req.params;
            await getService(req).deleteSession(req.user!, sessionUuid);
            res.json({
                status: 'ok',
                results: null,
            });
        } catch (e) {
            next(e);
        }
    },
);
