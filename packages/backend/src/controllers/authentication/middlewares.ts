/// <reference path="../../@types/passport-openidconnect.d.ts" />
/// <reference path="../../@types/express-session.d.ts" />
import {
    ApiError,
    AuthorizationError,
    DeactivatedAccountError,
    InvalidUser,
    LightdashMode,
} from '@lightdash/common';
import OAuth2Server from '@node-oauth/oauth2-server';
import { ErrorRequestHandler, Request, RequestHandler } from 'express';

import passport from 'passport';
import { URL } from 'url';
import { fromApiKey, fromOauth } from '../../auth/account/account';
import { buildAccountExistsWarning } from '../../auth/account/warnAccountExists';
import { lightdashConfig } from '../../config/lightdashConfig';
import { authenticateServiceAccount } from '../../ee/authentication';
import Logger from '../../logging/logger';

export const isAuthenticated: RequestHandler = (req, res, next) => {
    if (req.account?.isAuthenticated() || req.user?.userUuid) {
        if (req.account?.user?.isActive || req.user?.isActive) {
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

export const allowOauthAuthentication: RequestHandler = (req, res, next) => {
    if (req.isAuthenticated()) {
        next();
        return;
    }
    const oauthReq = new OAuth2Server.Request(req);
    const oauthRes = new OAuth2Server.Response(res);

    req.services
        .getOauthService()
        .authenticate(oauthReq, oauthRes)
        .then((token) => {
            // attach token info to the authInfo request
            req.services
                .getUserService()
                .findSessionUser({
                    id: token.user.userUuid,
                    organization: token.user.organizationUuid,
                })
                .then((user) => {
                    if (req.account?.isAuthenticated()) {
                        Logger.warn(
                            buildAccountExistsWarning('OAuth'),
                            req.account?.authentication?.type,
                        );
                    }
                    if (user) {
                        req.account = fromOauth(user, token);
                    }
                    req.user = user;
                    next();
                })
                .catch((userError) => {
                    // This was a valid oauth token, but the user was not found in the database
                    // in this case, we will throw an error
                    next(userError);
                });
        })
        .catch((error) => {
            // This middleware might be trying to authenticate with a non Oauth token
            // in that case, we will not throw an error, and we will continue with the next middleware
            Logger.warn(
                `OAuth authentication failed: ${JSON.stringify(error)}`,
            );
            next();
        });
};
/*
This middleware is used to enable Api tokens and service accounts
We first check service accounts (bearer header),
then we check Personal access tokens (ApiKey header), which can throw an error if the token is invalid
*/
export const allowApiKeyAuthentication: RequestHandler = (req, res, next) => {
    if (req.isAuthenticated()) {
        next();
        return;
    }

    const authenticateWithPat = () => {
        if (req.isAuthenticated()) {
            next();
            return;
        }
        if (!lightdashConfig.auth.pat.enabled) {
            throw new AuthorizationError('Personal access tokens are disabled');
        }
        passport.authenticate('headerapikey', { session: false })(
            req,
            res,
            () => {
                if (req?.account?.isAuthenticated()) {
                    Logger.warn(
                        buildAccountExistsWarning('ApiKey'),
                        req.account?.authentication?.type,
                    );
                }

                if (req.user) {
                    req.account = fromApiKey(
                        req.user!,
                        req.headers.authorization || '',
                    );
                }
                next();
            },
        );
    };
    try {
        authenticateServiceAccount(req, res, authenticateWithPat);
    } catch (e) {
        authenticateWithPat();
    }
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

export const storeSlackContext: RequestHandler = (req, res, next) => {
    const { team, channel, message, thread_ts: threadTs } = req.query;
    req.session.slack = {};

    if (typeof team === 'string') {
        req.session.slack.teamId = team;
    }
    if (typeof channel === 'string') {
        req.session.slack.channelId = channel;
    }
    if (typeof message === 'string') {
        req.session.slack.messageTs = message;
    }
    if (typeof threadTs === 'string') {
        req.session.slack.threadTs = threadTs;
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

export const deprecatedResultsRoute: RequestHandler =
    getDeprecatedRouteMiddleware(
        new Date('2025-04-30'),
        `Please use 'POST /api/v2/projects/{projectUuid}/query' in conjuntion with 'GET /api/v2/projects/{projectUuid}/query/{queryUuid}' instead.`,
    );

export const invalidUserErrorHandler: ErrorRequestHandler = (
    err,
    req,
    res,
    next,
) => {
    if (!(err instanceof InvalidUser)) {
        next(err);
        return;
    }

    req.session.destroy((error) => {
        if (error) Logger.error(error);
        if (req.url.includes('/api')) {
            const apiErrorResponse: ApiError = {
                status: 'error',
                error: {
                    statusCode: err.statusCode,
                    name: err.name,
                    message: err.message,
                    data: err.data,
                },
            };

            res.status(401).send(apiErrorResponse);
            return;
        }

        // if original url is an invite link, redirect to it
        if (
            req.path.match(
                // invite link regex
                /^\/invite\/([A-Za-z0-9_-]{30})$/,
            )
        ) {
            Logger.info(`Invalid user, redirecting to ${req.path}`);
            res.redirect(req.path);
            return;
        }

        Logger.info('Invalid user, redirecting to login');
        res.redirect('/login');
    });
};
