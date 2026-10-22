import type { RequestHandler } from 'express';
import passport from 'passport';
import { validate as isUuid } from 'uuid';
import { getOidcRedirectURL } from './middlewares';
import { getLoginHint } from './utils';

export const validateGooglePersonalCallback: RequestHandler = async (
    req,
    res,
    next,
) => {
    if (
        !Object.prototype.hasOwnProperty.call(
            req.session.oauth ?? {},
            'googlePersonalReconnect',
        )
    )
        return next();
    const personal = req.session.oauth?.googlePersonalReconnect;
    try {
        if (
            !personal ||
            typeof personal !== 'object' ||
            typeof personal.credentialUuid !== 'string' ||
            !isUuid(personal.credentialUuid) ||
            !req.user ||
            personal.userUuid !== req.user.userUuid ||
            req.session.oauth?.intent !== 'link' ||
            req.session.oauth.googleReconnect?.userUuid !== req.user.userUuid
        ) {
            res.redirect(getOidcRedirectURL(false)(req));
            return;
        }
        await req.services
            .getUserService()
            .validatePersonalBigqueryReconnect(
                req.user,
                personal.credentialUuid,
            );
        next();
    } catch {
        res.redirect(getOidcRedirectURL(false)(req));
    }
};

export const authenticateBigquery: RequestHandler = async (req, res, next) => {
    try {
        req.session.oauth ??= {};
        const suppliedPersonal = Object.prototype.hasOwnProperty.call(
            req.query,
            'personalCredentialUuid',
        );
        if (suppliedPersonal) {
            if (
                typeof req.query.personalCredentialUuid !== 'string' ||
                !isUuid(req.query.personalCredentialUuid) ||
                !req.user ||
                req.query.reconnect !== 'true' ||
                req.session.oauth.intent !== 'link'
            ) {
                res.redirect(getOidcRedirectURL(false)(req));
                return;
            }
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
        if (req.query.reconnect === 'true' && !req.user) {
            res.redirect(getOidcRedirectURL(false)(req));
            return;
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
        if (
            Object.prototype.hasOwnProperty.call(
                req.query,
                'personalCredentialUuid',
            )
        ) {
            res.redirect(getOidcRedirectURL(false)(req));
            return;
        }
        next(error);
    }
};
