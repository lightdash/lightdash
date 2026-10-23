import express from 'express';
import passport from 'passport';
import { Strategy } from 'passport-google-oauth20';
import { lightdashConfig } from '../config/lightdashConfig';
import {
    getOidcRedirectURL,
    storeOIDCLinkIntent,
    storeOIDCRedirect,
} from '../controllers/authentication/middlewares';
import { patchedPrerequisiteGoogleStrategyVerify } from './patchedPrerequisiteGoogleStrategy.mock';

export const createPatchedPrerequisiteGoogleBackend = () => {
    const apiV1Router = express.Router();
    apiV1Router.get(
        '/login/bigquery',
        storeOIDCRedirect,
        storeOIDCLinkIntent,
        (req, res, next) => {
            if ('personalCredentialUuid' in req.query) {
                res.redirect(getOidcRedirectURL(false)(req));
                return;
            }
            next();
        },
        passport.authenticate('google', {
            scope: [
                'profile',
                'email',
                'https://www.googleapis.com/auth/bigquery',
            ],
            accessType: 'offline',
            prompt: 'consent',
            session: false,
            includeGrantedScopes: true,
        }),
    );
    apiV1Router.get(
        lightdashConfig.auth.google.callbackPath,
        (req, res, next) => {
            if (
                req.session.oauth &&
                'googlePersonalReconnect' in req.session.oauth
            ) {
                res.redirect(getOidcRedirectURL(false)(req));
                return;
            }
            if (req.session.oauth?.intent === 'link') {
                passport.authenticate(
                    'google',
                    { includeGrantedScopes: true, session: false },
                    (error, user) => {
                        if (error) {
                            next(error);
                            return;
                        }
                        res.redirect(getOidcRedirectURL(Boolean(user))(req));
                    },
                )(req, res, next);
                return;
            }

            passport.authenticate('google', {
                failureRedirect: getOidcRedirectURL(false)(req),
                successRedirect: getOidcRedirectURL(true)(req),
                failureFlash: true,
                includeGrantedScopes: true,
            })(req, res, next);
        },
    );
    return {
        router: apiV1Router,
        strategy: new Strategy(
            {
                clientID: lightdashConfig.auth.google.oauth2ClientId!,
                clientSecret: lightdashConfig.auth.google.oauth2ClientSecret!,
                callbackURL: new URL(
                    `/api/v1${lightdashConfig.auth.google.callbackPath}`,
                    lightdashConfig.siteUrl,
                ).href,
                passReqToCallback: true,
                pkce: true,
                state: true,
            },
            patchedPrerequisiteGoogleStrategyVerify,
        ),
    };
};
