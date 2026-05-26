/// <reference path="../../../@types/passport-openidconnect.d.ts" />
/// <reference path="../../../@types/express-session.d.ts" />
import { OneLoginSsoConfig, OpenIdIdentityIssuerType } from '@lightdash/common';
import { Strategy as OpenIDConnectStrategy } from 'passport-openidconnect';
import { URL } from 'url';
import { lightdashConfig } from '../../../config/lightdashConfig';
import { genericOidcHandler } from './oidcStrategy';

/**
 * Builds a OneLogin passport strategy from a config object. OneLogin's OIDC
 * endpoints are templated from the issuer (`{issuer}/oidc/2/...`), so this is
 * synchronous (no discovery) — used by both the env-based and per-org paths.
 */
export const createOneLoginStrategyForConfig = (
    config: OneLoginSsoConfig,
): OpenIDConnectStrategy =>
    new OpenIDConnectStrategy(
        {
            clientID: config.oauth2ClientId,
            clientSecret: config.oauth2ClientSecret,
            issuer: new URL(`/oidc/2`, config.oauth2Issuer).href,
            callbackURL: new URL(
                `/api/v1${lightdashConfig.auth.oneLogin.callbackPath}`,
                lightdashConfig.siteUrl,
            ).href,
            authorizationURL: new URL(`/oidc/2/auth`, config.oauth2Issuer).href,
            tokenURL: new URL(`/oidc/2/token`, config.oauth2Issuer).href,
            userInfoURL: new URL(`/oidc/2/me`, config.oauth2Issuer).href,
            passReqToCallback: true,
        },
        genericOidcHandler(OpenIdIdentityIssuerType.ONELOGIN),
    );

export const isOneLoginPassportStrategyAvailableToUse = !!(
    lightdashConfig.auth.oneLogin.oauth2ClientId &&
    lightdashConfig.auth.oneLogin.oauth2ClientSecret &&
    lightdashConfig.auth.oneLogin.oauth2Issuer
);

export const oneLoginPassportStrategy = isOneLoginPassportStrategyAvailableToUse
    ? createOneLoginStrategyForConfig({
          oauth2ClientId: lightdashConfig.auth.oneLogin.oauth2ClientId!,
          oauth2ClientSecret: lightdashConfig.auth.oneLogin.oauth2ClientSecret!,
          oauth2Issuer: lightdashConfig.auth.oneLogin.oauth2Issuer!,
      })
    : undefined;
