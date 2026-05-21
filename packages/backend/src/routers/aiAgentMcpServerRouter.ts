import express, { type Router } from 'express';
import { lightdashConfig } from '../config/lightdashConfig';
import { AiAgentService } from '../ee/services/AiAgentService/AiAgentService';
import Logger from '../logging/logger';

export const aiAgentMcpServerRouter: Router = express.Router({
    mergeParams: true,
});

const getAiAgentService = (req: express.Request): AiAgentService =>
    req.services.getAiAgentService<AiAgentService>();

const getProjectParams = (
    req: express.Request,
): { projectUuid: string; mcpServerUuid: string } =>
    req.params as {
        projectUuid: string;
        mcpServerUuid: string;
    };

aiAgentMcpServerRouter.get(
    '/aiAgents/mcpServers/:mcpServerUuid/oauth/callback',
    async (req, res) => {
        const { projectUuid, mcpServerUuid } = getProjectParams(req);
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
                projectUuid,
                mcpServerUuid,
                code: typeof code === 'string' ? code : undefined,
                state: typeof state === 'string' ? state : undefined,
            });
            res.redirect(302, successRedirect);
        } catch (error) {
            Logger.error(
                `[AiAgent][MCP][${mcpServerUuid}] OAuth callback failed`,
                error,
            );
            res.redirect(302, failureRedirect);
        }
    },
);
