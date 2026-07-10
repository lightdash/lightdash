import express, { type Router } from 'express';
import { lightdashConfig } from '../config/lightdashConfig';
import { AiAgentService } from '../ee/services/AiAgentService/AiAgentService';
import Logger from '../logging/logger';

export const aiAgentMcpOAuthCallbackRouter: Router = express.Router();

const getAiAgentService = (req: express.Request): AiAgentService =>
    req.services.getAiAgentService<AiAgentService>();

const handleOAuthCallback = async (
    req: express.Request,
    res: express.Response,
) => {
    const { code, state } = req.query;
    const successRedirect = new URL(
        '/auth/popup/success',
        lightdashConfig.siteUrl,
    ).toString();
    const failureRedirect = new URL(
        '/auth/popup/failure',
        lightdashConfig.siteUrl,
    ).toString();

    try {
        await getAiAgentService(req).completeMcpOAuthConnection({
            code: typeof code === 'string' ? code : undefined,
            state: typeof state === 'string' ? state : undefined,
        });
        res.redirect(302, successRedirect);
    } catch (error) {
        Logger.error(`[AiAgent][MCP] OAuth callback failed`, error);
        res.redirect(302, failureRedirect);
    }
};

aiAgentMcpOAuthCallbackRouter.get('/aiAgents/mcp/oauth/callback', (req, res) =>
    handleOAuthCallback(req, res),
);
