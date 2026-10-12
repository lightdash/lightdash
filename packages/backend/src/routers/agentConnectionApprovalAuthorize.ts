import { type Request, type Response } from 'express';
import { validate as isUuid } from 'uuid';
import { hasApprovalBrowserSession } from '../controllers/authentication/agentConnectionApproval';
import {
    AgentConnectionApprovalError,
    sendAgentConnectionApprovalError,
} from '../services/AgentConnectionApprovalService/AgentConnectionApprovalError';

export const AGENT_CONNECTION_APPROVAL_ROUTE = '/agent/connection-approval';

export const hasAgentApprovalParameter = (req: Request): boolean =>
    Object.hasOwn(req.query ?? {}, 'agent_request') ||
    Object.hasOwn(req.body ?? {}, 'agent_request');

const withoutAgentParameter = (url: string): string => {
    const separator = url.indexOf('?');
    if (separator < 0) return url;
    const query = url
        .slice(separator + 1)
        .split('&')
        .filter((part) => {
            try {
                return !/^agent_request(?:\[.*\])?$/.test(
                    decodeURIComponent(part.split('=')[0].replace(/\+/g, ' ')),
                );
            } catch {
                return true;
            }
        })
        .join('&');
    return `${url.slice(0, separator)}${query ? `?${query}` : ''}`;
};

export const handleAgentApprovalAuthorize = async (
    req: Request,
    res: Response,
): Promise<boolean> => {
    try {
        const service = req.services.getAgentConnectionApprovalService();
        if (!(await service.isEnabledForUser(req.user))) {
            const opaqueSignedOut =
                !req.user &&
                Object.keys(req.query).length === 1 &&
                Object.keys(req.body ?? {}).length === 0;
            if (!opaqueSignedOut) {
                delete req.query.agent_request;
                if (req.body) delete req.body.agent_request;
                req.url = withoutAgentParameter(req.url);
                req.originalUrl = withoutAgentParameter(req.originalUrl);
            }
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
            req.headers.authorization ||
            req.headers['x-api-key'] ||
            req.headers['x-lightdash-token'] ||
            req.headers['x-embed-token']
        )
            throw new AgentConnectionApprovalError('person_required');
        const requestUuid = values[0];
        if (!hasApprovalBrowserSession(req)) {
            res.redirect(
                `/login?redirect=${encodeURIComponent(`/api/v1/oauth/authorize?agent_request=${requestUuid}`)}`,
            );
            return true;
        }
        await service.assertReviewable(req.account, requestUuid);
        res.redirect(
            `${AGENT_CONNECTION_APPROVAL_ROUTE}?request=${requestUuid}`,
        );
        return true;
    } catch (error) {
        sendAgentConnectionApprovalError(res, error);
        return true;
    }
};
