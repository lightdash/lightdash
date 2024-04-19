/// <reference path="../../@types/passport-openidconnect.d.ts" />
/// <reference path="../../@types/express-session.d.ts" />
import { AuthorizationError, LightdashMode } from '@lightdash/common';
import { Request, RequestHandler } from 'express';
import passport from 'passport';
import { URL } from 'url';
import { lightdashConfig } from '../../config/lightdashConfig';

export const isAuthenticated: RequestHandler = (req, res, next) => {
    if (req.user?.userUuid) {
        next();
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

    if (lightdashConfig.auth.disablePat === true) {
        throw new AuthorizationError('Personal access tokens are disabled');
    }
    passport.authenticate('headerapikey', { session: false })(req, res, next);
};

export const storeOIDCRedirect: RequestHandler = (req, res, next) => {
    const { redirect, inviteCode } = req.query;
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
    next();
};

export const getSuccessURLWithReturnTo = (req: Request): string => {
    const url = new URL('/api/v1/oauth/success', lightdashConfig.siteUrl);
    if (req.session.oauth?.returnTo) {
        url.searchParams.set(
            'returnTo',
            decodeURIComponent(req.session.oauth.returnTo),
        );
    }
    return url.href;
};

export const redirectOIDC: RequestHandler = (req, res) => {
    // Workaround for https://github.com/jaredhanson/passport/pull/941
    const queryReturn = req.query.returnTo;

    const returnUrl =
        queryReturn && typeof queryReturn === 'string'
            ? new URL(queryReturn, lightdashConfig.siteUrl)
            : undefined;

    if (returnUrl && returnUrl.host === new URL(lightdashConfig.siteUrl).host) {
        const redirectUrl = `${returnUrl.pathname}${returnUrl.search}`;
        return res.redirect(redirectUrl);
    }
    return res.redirect('/');
};
