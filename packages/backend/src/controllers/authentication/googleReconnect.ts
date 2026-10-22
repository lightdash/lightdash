import type { RequestHandler } from 'express';
import passport from 'passport';
import { getLoginHint } from './utils';

export const authenticateBigquery: RequestHandler = async (req, res, next) => {
    try {
        req.session.oauth ??= {};
        if (typeof req.query.personalCredentialUuid === 'string' && req.user) {
            await req.services
                .getUserService()
                .validatePersonalBigqueryReconnect(
                    req.user,
                    req.query.personalCredentialUuid,
                );
            req.session.oauth.googlePersonalReconnect = {
                userUuid: req.user.userUuid,
                credentialUuid: req.query.personalCredentialUuid,
            };
        }
        const context =
            req.query.reconnect === 'true' && req.user
                ? await req.services
                      .getUserService()
                      .getGoogleReconnectContext(req.user)
                : undefined;
        if (context && req.user) {
            req.session.oauth.googleReconnect = {
                ...context,
                userUuid: req.user.userUuid,
                consentAttempted: false,
            };
        }
        passport.authenticate('google', {
            scope: [
                'profile',
                'email',
                'https://www.googleapis.com/auth/bigquery',
            ],
            accessType: 'offline',
            ...(context
                ? { loginHint: context.email }
                : { prompt: 'consent', loginHint: getLoginHint(req) }),
            session: false,
            includeGrantedScopes: true,
        })(req, res, next);
    } catch (error) {
        next(error);
    }
};

export const retryGoogleReconnect: RequestHandler = (req, res, next) => {
    const reconnect = req.session.oauth?.googleReconnect;
    if (!reconnect || !reconnect.retryWithConsent || reconnect.consentAttempted)
        return next();
    reconnect.retryWithConsent = false;
    reconnect.consentAttempted = true;
    passport.authenticate('google', {
        scope: ['profile', 'email', 'https://www.googleapis.com/auth/bigquery'],
        accessType: 'offline',
        loginHint: reconnect.email,
        prompt: 'consent',
        session: false,
        includeGrantedScopes: true,
    })(req, res, next);
};
