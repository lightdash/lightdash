/// <reference path="../../@types/passport-openidconnect.d.ts" />
/// <reference path="../../@types/express-session.d.ts" />
import {
    AuthorizationError,
    DeactivatedAccountError,
    InvalidUser,
    LightdashMode,
} from '@lightdash/common';
import { ErrorRequestHandler, Request, RequestHandler } from 'express';
import passport from 'passport';
import { URL } from 'url';
import { lightdashConfig } from '../../config/lightdashConfig';

export const isAuthenticated: RequestHandler = (req, res, next) => {
    if (req.user?.userUuid) {
        if (req.user.isActive) {
            next();
        } else {
            // Destroy session if user is deactivated and return error
            req.session.destroy((err) => {
                if (err) {
                    next(err);
                } else {
                    next(new DeactivatedAccountError());
                }
            });
        }
    } else {
        next(new AuthorizationError(`Failed to authorize user`));
    }
};

export const unauthorisedInDemo: RequestHandler = (req, res, next) => {
    if (lightdashConfig.mode === LightdashMode.DEMO) {
        throw new AuthorizationError('Action not available in demo');
    } else {
        next();
    }
};

export const allowApiKeyAuthentication: RequestHandler = (req, res, next) => {
    if (req.isAuthenticated()) {
        next();
        return;
    }

    if (!lightdashConfig.auth.pat.enabled) {
        throw new AuthorizationError('Personal access tokens are disabled');
    }
    passport.authenticate('headerapikey', { session: false })(req, res, next);
};

export const storeOIDCRedirect: RequestHandler = (req, res, next) => {
    const { redirect, inviteCode, isPopup } = req.query;
    req.session.oauth = {};

    if (typeof inviteCode === 'string') {
        req.session.oauth.inviteCode = inviteCode;
    }
    if (typeof redirect === 'string') {
        try {
            const redirectUrl = new URL(redirect, lightdashConfig.siteUrl);
            const originUrl = new URL(lightdashConfig.siteUrl);
            if (
                redirectUrl.host === originUrl.host ||
                process.env.NODE_ENV === 'development'
            ) {
                req.session.oauth.returnTo = redirectUrl.href;
            }
        } catch (e) {
            next(); // fail silently if we can't parse url
        }
    }
    if (typeof isPopup === 'string' && isPopup === 'true') {
        req.session.oauth.isPopup = true;
    }
    next();
};

export const getOidcRedirectURL =
    (isSuccess: boolean) =>
    (req: Request): string => {
        if (req.session.oauth?.isPopup) {
            return new URL(
                isSuccess ? '/auth/popup/success' : '/auth/popup/failure',
                lightdashConfig.siteUrl,
            ).href;
        }
        if (
            req.session.oauth?.returnTo &&
            typeof req.session.oauth?.returnTo === 'string'
        ) {
            const returnUrl = new URL(
                req.session.oauth?.returnTo,
                lightdashConfig.siteUrl,
            );
            if (returnUrl.host === new URL(lightdashConfig.siteUrl).host) {
                return returnUrl.href;
            }
        }
        return new URL('/', lightdashConfig.siteUrl).href;
    };

/**
 * This middleware is used to handle InvalidUser errors that might occur when a user tries to access an invite link.
 * This happens when the user is not logged in and tries to access an invite link, but there is already a session for that user that has not been destroyed.
 * It destroys the session and returns a 401 error if there's an error destroying the session.
 * @param err
 * @param req
 * @param res
 * @param next
 * @returns
 */
export const inviteLinkErrorHandler: ErrorRequestHandler = (
    err,
    req,
    res,
    next,
) => {
    if (err instanceof InvalidUser) {
        const inviteLinkMatch = req.path.match(
            /^\/api\/v1\/invite-links\/([A-Za-z0-9_-]{30})$/,
        );
        if (req.session.id && inviteLinkMatch && req.method === 'GET') {
            req.session.destroy((destroyErr) => {
                if (destroyErr) {
                    throw new AuthorizationError(
                        `Error destroying session for invite-related path: ${destroyErr.message}`,
                    );
                }
            });

            return next();
        }
    }

    return next(err);
};

/**
 * This middleware is used to handle deprecated API routes.
 * It sets a warning header and returns a 299 status code.
 * @param date - The date when the deprecated route will be removed
 * @param suffixMessage - An optional suffix message to add to the warning header
 * @returns
 */
export const getDeprecatedRouteMiddleware =
    (date: Date, suffixMessage?: string): RequestHandler =>
    (_req, res, next) => {
        const newRouteMessage = suffixMessage ? ` ${suffixMessage}` : '';
        res.setHeader(
            'Warning',
            `299 - "This API endpoint is deprecated and will be removed after ${date}.${newRouteMessage}"`,
        );
        next();
    };

export const deprecatedResultsRoute = getDeprecatedRouteMiddleware(
    new Date('2025-04-30'),
    `Please use 'POST /api/v2/projects/{projectUuid}/query' in conjuntion with 'GET /api/v2/projects/{projectUuid}/query/{queryUuid}' instead.`,
);
