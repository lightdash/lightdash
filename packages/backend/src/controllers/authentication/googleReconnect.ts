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
        const isReconnect = req.query.reconnect === 'true' && !!req.user;
        const context =
            isReconnect && req.user
                ? await req.services
                      .getUserService()
                      .getGoogleReconnectContext(req.user)
                : undefined;
        if (isReconnect && req.user) {
            req.session.oauth.googleReconnect = {
                subject: context?.subject ?? null,
                email: context?.email ?? null,
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
            ...(isReconnect
                ? { loginHint: context?.email ?? getLoginHint(req) }
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
        loginHint: reconnect.email ?? getLoginHint(req),
        prompt: 'consent',
        session: false,
        includeGrantedScopes: true,
    })(req, res, next);
};
