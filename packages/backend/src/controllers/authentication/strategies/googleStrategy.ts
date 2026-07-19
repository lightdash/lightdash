/// <reference path="../../../@types/passport-openidconnect.d.ts" />
/// <reference path="../../../@types/express-session.d.ts" />
import {
    AuthorizationError,
    LightdashError,
    OpenIdIdentityIssuerType,
    OpenIdUser,
} from '@lightdash/common';
import express from 'express';
import {
    GoogleCallbackParameters,
    Strategy as GoogleStrategy,
    Profile,
    VerifyCallback,
} from 'passport-google-oauth20';
import { URL } from 'url';
import { lightdashConfig } from '../../../config/lightdashConfig';
import Logger from '../../../logging/logger';

export const googleStrategyVerify = async (
    req: Express.Request,
    _accessToken: string,
    refreshToken: string,
    params: GoogleCallbackParameters,
    profile: Profile,
    done: VerifyCallback,
) => {
    try {
        const issuer = 'https://accounts.google.com';
        const { inviteCode, intent } = req.session.oauth || {};
        const [{ value: email }] = profile.emails || [];
        const { id: subject } = profile;
        if (!(email && subject)) {
            return done(null, undefined, {
                message: 'Could not parse authentication token',
            });
        }

        const normalisedIssuer = new URL('/', issuer).origin;
        const openIdUser: OpenIdUser = {
            openId: {
                issuer: normalisedIssuer,
                email,
                subject,
                firstName: profile.name?.givenName,
                lastName: profile.name?.familyName,
                issuerType: OpenIdIdentityIssuerType.GOOGLE,
            },
        };
        const scopes = params.scope.split(' ').filter(Boolean);
        const hasBigqueryScope = scopes.includes(
            'https://www.googleapis.com/auth/bigquery',
        );
        const userService = req.services.getUserService();

        if (intent === 'link') {
            if (!req.user) {
                throw new AuthorizationError(
                    'You must be logged in to connect a Google account',
                );
            }

            await userService.storeOAuthGrant(
                req.user,
                OpenIdIdentityIssuerType.GOOGLE,
                refreshToken,
                scopes,
                openIdUser.openId,
            );

            if (hasBigqueryScope) {
                Logger.info(
                    `Creating user warehouse credentials for bigquery on Google OAuth`,
                );
                await userService.createBigqueryWarehouseCredentials(
                    req.user,
                    refreshToken,
                );
            }

            return done(null, req.user);
        }

        const user = await userService.loginWithOpenId(
            openIdUser,
            req.user,
            inviteCode,
            undefined,
            {
                ip: (req as express.Request).ip,
                userAgent: (req as express.Request).get('user-agent'),
            },
        );

        if (refreshToken) {
            await userService.storeOAuthGrant(
                user,
                OpenIdIdentityIssuerType.GOOGLE,
                refreshToken,
                scopes,
                openIdUser.openId,
            );
        }

        if (hasBigqueryScope) {
            Logger.info(
                `Creating user warehouse credentials for bigquery on Google OAuth`,
            );
            await userService.createBigqueryWarehouseCredentials(
                user,
                refreshToken,
            );
        }
        return done(null, user);
    } catch (e) {
        if (e instanceof LightdashError) {
            return done(null, undefined, { message: e.message });
        }
        Logger.warn(`Unexpected error while authorizing user: ${e}`);
        return done(null, undefined, {
            message: 'Unexpected error authorizing user',
        });
    }
};

export const googlePassportStrategy: GoogleStrategy | undefined = !(
    lightdashConfig.auth.google.oauth2ClientId &&
    lightdashConfig.auth.google.oauth2ClientSecret
)
    ? undefined
    : new GoogleStrategy(
          {
              clientID: lightdashConfig.auth.google.oauth2ClientId,
              clientSecret: lightdashConfig.auth.google.oauth2ClientSecret,
              callbackURL: new URL(
                  `/api/v1${lightdashConfig.auth.google.callbackPath}`,
                  lightdashConfig.siteUrl,
              ).href,
              passReqToCallback: true,
              pkce: true,
              state: true,
          },
          googleStrategyVerify,
      );
