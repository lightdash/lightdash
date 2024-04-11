/// <reference path="../../../@types/passport-openidconnect.d.ts" />
/// <reference path="../../../@types/express-session.d.ts" />
import { OpenIdIdentityIssuerType } from '@lightdash/common';
import { Strategy as OpenIDConnectStrategy } from 'passport-openidconnect';
import { URL } from 'url';
import { lightdashConfig } from '../../../config/lightdashConfig';
import { genericOidcHandler } from './oidcStrategy';

export const oneLoginPassportStrategy = !(
    lightdashConfig.auth.oneLogin.oauth2ClientId &&
    lightdashConfig.auth.oneLogin.oauth2ClientSecret &&
    lightdashConfig.auth.oneLogin.oauth2Issuer
)
    ? undefined
    : new OpenIDConnectStrategy(
          {
              clientID: lightdashConfig.auth.oneLogin.oauth2ClientId,
              clientSecret: lightdashConfig.auth.oneLogin.oauth2ClientSecret,
              issuer: new URL(
                  `/oidc/2`,
                  lightdashConfig.auth.oneLogin.oauth2Issuer,
              ).href,
              callbackURL: new URL(
                  `/api/v1${lightdashConfig.auth.oneLogin.callbackPath}`,
                  lightdashConfig.siteUrl,
              ).href,
              authorizationURL: new URL(
                  `/oidc/2/auth`,
                  lightdashConfig.auth.oneLogin.oauth2Issuer,
              ).href,
              tokenURL: new URL(
                  `/oidc/2/token`,
                  lightdashConfig.auth.oneLogin.oauth2Issuer,
              ).href,
              userInfoURL: new URL(
                  `/oidc/2/me`,
                  lightdashConfig.auth.oneLogin.oauth2Issuer,
              ).href,
              passReqToCallback: true,
          },
          genericOidcHandler(OpenIdIdentityIssuerType.ONELOGIN),
      );
