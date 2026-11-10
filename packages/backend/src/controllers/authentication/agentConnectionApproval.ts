import { JWT_HEADER_NAME } from '@lightdash/common';
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

const alternativeCredentialHeaders = [
    'x-api-key',
    'x-lightdash-token',
    JWT_HEADER_NAME,
];

const approvalHeaderCount = (req: Request, name: string): number =>
    Math.max(
        req.rawHeaders.filter(
            (header, index) => index % 2 === 0 && header.toLowerCase() === name,
        ).length,
        Number(Object.hasOwn(req.headers, name)),
    );

export const hasApprovalCredentialHeader = (req: Request): boolean =>
    ['authorization', ...alternativeCredentialHeaders].some(
        (name) => approvalHeaderCount(req, name) > 0,
    );

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
        if (
            req.account &&
            !['session', 'pat'].includes(req.account.authentication.type)
        )
            throw new AgentConnectionApprovalError('person_required');
        const authorizationHeaders = approvalHeaderCount(req, 'authorization');
        const { authorization } = req.headers;
        const browser = hasApprovalBrowserSession(req);
        if (
            authorizationHeaders > 1 ||
            (browser && authorizationHeaders > 0) ||
            alternativeCredentialHeaders.some(
                (name) => approvalHeaderCount(req, name) > 0,
            )
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
            hasApprovalCredentialHeader(req) ||
            (req.account && req.account.authentication.type !== 'session')
        )
            throw new AgentConnectionApprovalError('browser_session_required');
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
