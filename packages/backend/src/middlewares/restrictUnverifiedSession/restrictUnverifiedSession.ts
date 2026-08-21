import {
    ForbiddenError,
    type Account,
    type SessionAccount,
} from '@lightdash/common';
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

const normalizePath = (path: string) =>
    path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path;

const isAllowedRequest = (method: string, path: string) =>
    allowedRequests.some(
        (allowedRequest) =>
            allowedRequest.method === method &&
            allowedRequest.path === normalizePath(path),
    );

const isSessionAccount = (
    account: Account | undefined,
): account is SessionAccount => account?.authentication.type === 'session';

export const createRestrictUnverifiedSessionMiddleware =
    ({ hasEmailClient }: RestrictUnverifiedSessionOptions): RequestHandler =>
    (req, _res, next) => {
        const { account } = req;
        const path = normalizePath(req.path);
        if (
            !hasEmailClient ||
            !isSessionAccount(account) ||
            !path.startsWith('/api/') ||
            isAllowedRequest(req.method, path)
        ) {
            next();
            return;
        }
        if (account.user.isEmailVerified === true) {
            next();
            return;
        }
        next(new ForbiddenError('User has not verified their email'));
    };
