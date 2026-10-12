import { type Request, type RequestHandler } from 'express';
import express from 'express';
import { fromApiKey, fromSession } from '../../auth/account/account';
import { lightdashConfig } from '../../config/lightdashConfig';
import {
    AgentConnectionApprovalError,
    sendAgentConnectionApprovalError,
} from '../../services/AgentConnectionApprovalService/AgentConnectionApprovalError';
import { parseAgentConnectionApprovalRequest } from '../../services/AgentConnectionApprovalService/AgentConnectionApprovalService';
import {
    isApprovalUuid,
    parseApprovalDecision,
} from '../../services/AgentConnectionApprovalService/approvalReviewFlow';

export const AGENT_CONNECTION_REQUEST_PATH =
    '/api/v2/user/agent-connections/requests';

export const hasApprovalBrowserSession = (req: Request): boolean =>
    Boolean(
        req.user &&
        req.sessionID &&
        req.session?.passport?.user &&
        req.isAuthenticated() &&
        req.account?.authentication.type === 'session',
    );

export const parseAgentConnectionApprovalBody: RequestHandler = (
    req,
    res,
    next,
) => {
    express.json({ limit: 64 * 1024 })(req, res, (error?: unknown) => {
        if (error) {
            sendAgentConnectionApprovalError(
                res,
                new AgentConnectionApprovalError('invalid_approval_request'),
            );
            return;
        }
        next();
    });
};

export const authenticateAgentConnectionApproval: RequestHandler = async (
    req,
    res,
    next,
) => {
    try {
        res.set('Cache-Control', 'no-store');
        const authorizationHeaders = req.rawHeaders.filter(
            (_, index) =>
                index % 2 === 0 &&
                req.rawHeaders[index].toLowerCase() === 'authorization',
        );
        const { authorization } = req.headers;
        const browser = hasApprovalBrowserSession(req);
        if (
            authorizationHeaders.length > 1 ||
            (browser && authorization) ||
            req.headers['x-api-key'] ||
            req.headers['x-lightdash-token'] ||
            req.headers['x-embed-token']
        )
            throw new AgentConnectionApprovalError('person_required');
        if (authorization) {
            if (!/^ApiKey [^\s,]+$/.test(authorization))
                throw new AgentConnectionApprovalError('person_required');
            if (!lightdashConfig.auth.pat.enabled)
                throw new AgentConnectionApprovalError(
                    'authentication_required',
                );
            const person = await req.services
                .getUserService()
                .loginWithPersonalAccessToken(authorization.slice(7), {
                    ip: req.ip,
                    userAgent: req.get('user-agent'),
                })
                .catch(() => {
                    throw new AgentConnectionApprovalError(
                        'authentication_required',
                    );
                });
            req.user = person;
            req.account = fromApiKey(person, authorization);
        } else if (browser) {
            if (req.get('origin') !== new URL(lightdashConfig.siteUrl).origin)
                throw new AgentConnectionApprovalError('csrf_failed');
            req.account = fromSession(req.user!, req.sessionID);
        } else {
            throw new AgentConnectionApprovalError(
                req.account && req.account.authentication.type !== 'session'
                    ? 'person_required'
                    : 'authentication_required',
            );
        }
        if (!req.is('application/json'))
            throw new AgentConnectionApprovalError('invalid_approval_request');
        if (Buffer.byteLength(JSON.stringify(req.body) ?? '') > 64 * 1024)
            throw new AgentConnectionApprovalError('invalid_approval_request');
        req.body = parseAgentConnectionApprovalRequest(req.body);
        next();
    } catch (error) {
        sendAgentConnectionApprovalError(res, error);
    }
};

export const authenticateApprovalReview: RequestHandler = (req, res, next) => {
    try {
        res.set('Cache-Control', 'no-store');
        if (
            req.headers.authorization ||
            req.headers['x-api-key'] ||
            req.headers['x-lightdash-token'] ||
            req.headers['x-embed-token'] ||
            (req.account && req.account.authentication.type !== 'session')
        )
            throw new AgentConnectionApprovalError('person_required');
        if (!hasApprovalBrowserSession(req))
            throw new AgentConnectionApprovalError('authentication_required');
        if (!isApprovalUuid(req.params.requestUuid))
            throw new AgentConnectionApprovalError('invalid_approval_request');
        req.account = fromSession(req.user!, req.sessionID);
        if (req.method === 'POST') {
            if (req.get('origin') !== new URL(lightdashConfig.siteUrl).origin)
                throw new AgentConnectionApprovalError('csrf_failed');
            if (
                !req.is('application/json') ||
                Buffer.byteLength(JSON.stringify(req.body) ?? '') > 64 * 1024
            )
                throw new AgentConnectionApprovalError(
                    'invalid_approval_request',
                );
            req.body = parseApprovalDecision(req.body);
        }
        next();
    } catch (error) {
        sendAgentConnectionApprovalError(res, error);
    }
};
