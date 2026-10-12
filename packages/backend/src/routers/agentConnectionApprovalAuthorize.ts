import { type Request, type Response } from 'express';
import { validate as isUuid } from 'uuid';
import { oauthApiResource } from '../auth/oauthScopes/oauthResources';
import { lightdashConfig } from '../config/lightdashConfig';
import {
    hasApprovalBrowserSession,
    hasApprovalCredentialHeader,
} from '../controllers/authentication/agentConnectionApproval';
import {
    AgentConnectionApprovalError,
    sendAgentConnectionApprovalError,
} from '../services/AgentConnectionApprovalService/AgentConnectionApprovalError';

export const AGENT_CONNECTION_APPROVAL_ROUTE = '/agent/connection-approval';

export const hasAgentApprovalParameter = (req: Request): boolean =>
    Object.hasOwn(req.query ?? {}, 'agent_request') ||
    Object.hasOwn(req.body ?? {}, 'agent_request');

export const handleAgentApprovalAuthorize = async (
    req: Request,
    res: Response,
): Promise<boolean> => {
    try {
        const service = req.services.getAgentConnectionApprovalService();
        if (!(await service.isEnabledForUser(req.user))) {
            return false;
        }
        res.set('Cache-Control', 'no-store');
        const values = [
            req.query.agent_request,
            req.body?.agent_request,
        ].filter((value) => value !== undefined);
        if (
            values.length !== 1 ||
            typeof values[0] !== 'string' ||
            !isUuid(values[0]) ||
            Object.keys(req.query).some((key) => key !== 'agent_request') ||
            Object.keys(req.body ?? {}).some((key) => key !== 'agent_request')
        )
            throw new AgentConnectionApprovalError('invalid_approval_request');
        if (
            hasApprovalCredentialHeader(req) ||
            (req.account && req.account.authentication.type !== 'session')
        )
            throw new AgentConnectionApprovalError('person_required');
        const requestUuid = values[0];
        const instancePath = new URL(
            oauthApiResource(lightdashConfig.siteUrl),
        ).pathname.replace(/\/$/, '');
        if (!hasApprovalBrowserSession(req)) {
            res.redirect(
                `${instancePath}/login?redirect=${encodeURIComponent(`${instancePath}/api/v1/oauth/authorize?agent_request=${requestUuid}`)}`,
            );
            return true;
        }
        await service.assertReviewable(req.account, requestUuid);
        res.redirect(
            `${instancePath}${AGENT_CONNECTION_APPROVAL_ROUTE}?request=${requestUuid}`,
        );
        return true;
    } catch (error) {
        sendAgentConnectionApprovalError(res, error);
        return true;
    }
};
