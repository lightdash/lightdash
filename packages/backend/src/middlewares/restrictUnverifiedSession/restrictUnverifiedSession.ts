import { ForbiddenError } from '@lightdash/common';
import type { RequestHandler } from 'express';

type RestrictUnverifiedSessionOptions = {
    hasEmailClient: boolean;
};

const allowedRequests = [
    { method: 'GET', path: '/api/v1/health' },
    { method: 'GET', path: '/api/v1/user' },
    { method: 'GET', path: '/api/v1/user/account' },
    { method: 'PUT', path: '/api/v1/user/me/email/otp' },
    { method: 'GET', path: '/api/v1/user/me/email/status' },
    { method: 'GET', path: '/api/v1/logout' },
    { method: 'DELETE', path: '/api/v1/user/me' },
    { method: 'GET', path: '/api/v2/feature-flag/new-onboarding' },
] as const;

const normalizePath = (path: string) => {
    const lowerCasePath = path.toLowerCase();
    return lowerCasePath.length > 1 && lowerCasePath.endsWith('/')
        ? lowerCasePath.slice(0, -1)
        : lowerCasePath;
};

const isAllowedRequest = (method: string, path: string) =>
    allowedRequests.some(
        (allowedRequest) =>
            allowedRequest.method === method && allowedRequest.path === path,
    );

export const createRestrictUnverifiedSessionMiddleware =
    ({ hasEmailClient }: RestrictUnverifiedSessionOptions): RequestHandler =>
    (req, res, next) => {
        const { user } = req;
        const path = normalizePath(req.path);
        if (
            !hasEmailClient ||
            user === undefined ||
            !path.startsWith('/api/') ||
            isAllowedRequest(req.method, path)
        ) {
            next();
            return;
        }
        if (user.isEmailVerified === true) {
            next();
            return;
        }
        if (req.method === 'GET' && req.accepts(['json', 'html']) === 'html') {
            res.redirect(
                `/verify-email?redirect=${encodeURIComponent(req.originalUrl)}`,
            );
            return;
        }
        next(new ForbiddenError('User has not verified their email'));
    };
