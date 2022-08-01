/// <reference path="../@types/passport-google-oidc.d.ts" />
/// <reference path="../@types/passport-openidconnect.d.ts" />
/// <reference path="../@types/express-session.d.ts" />
import {
    AuthorizationError,
    isOpenIdUser,
    isSessionUser,
    LightdashError,
    LightdashMode,
    OpenIdUser,
    SessionUser,
} from '@lightdash/common';
import { Request, RequestHandler } from 'express';
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oidc';
import { HeaderAPIKeyStrategy } from 'passport-headerapikey';
import { Strategy as LocalStrategy } from 'passport-local';
import { Strategy as OpenIDConnectStrategy } from 'passport-openidconnect';
import { URL } from 'url';
import { lightdashConfig } from '../config/lightdashConfig';
import Logger from '../logger';
import { userService } from '../services/services';

// How a user makes authenticated requests
// 1. A cookie in the browser contains an encrypted cookie id
// 2. Every request from the frontend sends a cookie to the backend
// 3. express-session reads the cookie and looks up the cookie id in the sessions table in postgres
// 4. express-session attaches the data stored in the `sess` column in postgres to the request object `req.session`
// 5. Then passport looks for `req.session.passport.user` and passes the data to `deserializeUser`
// 6. `deserializeUser` translates `req.session.pasport.user` to a full user object and saves it on `req.user`

// How a user logs in
// 1. User sends login credentials to /login
// 2. passport.LocalStrategy compares the login details to data in postgres
// 3. passport.LocalStrategy creates a full user object and attaches it to `req.user`
// 4. `serializeUser` is called, which takes the full user object from `req.user`
// 5. `serializeUser` stores the user id on the request session `req.session.passport.user`
// 6. express-session saves the data on `req.session` to the session table in postgres under `sess`

// How a user links accounts with Google
// 1. User clicks button in frontend that opens /oauth/google/login - we also remember the page the user started on
// 2. passport.GoogleStrategy redirects the browser to Google where the user signs in to google and agrees to pass info to Lightdash
// 3. Google redirects the user to /oauth/google/callback with a secret token to show Lightdash that the user authenticated
// 4. passport.GoogleStrategy uses the token to send a request to Google to get the full profile information OpenIdUser
// 5. passport.GoogleStrategy compares the google details to data in postgres
// 6. passport.GoogleStrategy creates a full user object and attaches it to `req.user`
// 7. Follow steps 4-6 from "How a user is logs in"

export const getSessionUserFromRequest = ({
    user,
}: Request): SessionUser | undefined => {
    if (isSessionUser(user)) {
        return user;
    }
    return undefined;
};

export const getOpenIdUserFromRequest = ({
    user,
}: Request): OpenIdUser | undefined => {
    if (isOpenIdUser(user)) {
        return user;
    }
    return undefined;
};

export const localPassportStrategy = new LocalStrategy(
    { usernameField: 'email', passwordField: 'password' },
    async (email, password, done) => {
        try {
            const user = await userService.loginWithPassword(email, password);
            return done(null, user);
        } catch (e) {
            return done(
                e instanceof LightdashError
                    ? e
                    : new AuthorizationError(
                          'Unexpected error while logging in',
                      ),
            );
        }
    },
);
export const apiKeyPassportStrategy = new HeaderAPIKeyStrategy(
    { header: 'Authorization', prefix: 'ApiKey ' },
    true,
    async (token, done) => {
        try {
            const user = await userService.loginWithPersonalAccessToken(token);
            return done(null, user);
        } catch {
            return done(
                new AuthorizationError(
                    'Personal access token is not recognised',
                ),
            );
        }
    },
);

export const storeOIDCRedirect: RequestHandler = (req, res, next) => {
    const { redirect, inviteCode } = req.query;
    req.session.oauth = {};

    if (typeof inviteCode === 'string') {
        req.session.oauth.inviteCode = inviteCode;
    }
    if (typeof redirect === 'string') {
        try {
            const redirectUrl = new URL(redirect);
            const originUrl = new URL(lightdashConfig.siteUrl);
            if (
                redirectUrl.host === originUrl.host ||
                process.env.NODE_ENV === 'development'
            ) {
                req.session.oauth.returnTo = redirect;
            }
        } catch (e) {
            next(); // fail silently if we can't parse url
        }
    }
    next();
};
export const redirectOIDCSuccess: RequestHandler = (req, res) => {
    const { returnTo } = req.session.oauth || {};
    req.session.oauth = {};
    res.redirect(returnTo || '/');
};
export const redirectOIDCFailure: RequestHandler = (req, res) => {
    const { returnTo } = req.session.oauth || {};
    req.session.oauth = {};
    res.redirect(returnTo || '/');
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
          },
          async (req, issuer, profile, done) => {
              try {
                  const { inviteCode } = req.session.oauth || {};
                  req.session.oauth = {};
                  const [{ value: email }] = profile.emails;
                  const { id: subject } = profile;
                  if (!(email && subject)) {
                      return done(null, false, {
                          message: 'Could not parse authentication token',
                      });
                  }
                  // TODO why we ned this
                  const normalisedIssuer = new URL('/', issuer).origin; // normalise issuer
                  const openIdUser: OpenIdUser = {
                      openId: {
                          issuer: normalisedIssuer,
                          email,
                          subject,
                          firstName: profile.name?.givenName,
                          lastName: profile.name?.familyName,
                      },
                  };
                  const user = await userService.loginWithOpenId(
                      openIdUser,
                      req.user,
                      inviteCode,
                  );
                  return done(null, user);
              } catch (e) {
                  Logger.warn(`Failed to authorize user. ${e}`);
                  if (e instanceof LightdashError) {
                      return done(e);
                  }
                  return done(null, false, {
                      message: 'Unexpected error authorizing user',
                  });
              }
          },
      );
export const oktaPassportStrategy = !(
    lightdashConfig.auth.okta.oauth2ClientId &&
    lightdashConfig.auth.okta.oauth2ClientSecret &&
    lightdashConfig.auth.okta.oauth2Issuer &&
    lightdashConfig.auth.okta.oktaDomain
)
    ? undefined
    : new OpenIDConnectStrategy(
          {
              clientID: lightdashConfig.auth.okta.oauth2ClientId,
              clientSecret: lightdashConfig.auth.okta.oauth2ClientSecret,
              issuer: lightdashConfig.auth.okta.oauth2Issuer,
              callbackURL: new URL(
                  `/api/v1${lightdashConfig.auth.okta.callbackPath}`,
                  lightdashConfig.siteUrl,
              ).href,
              authorizationURL: new URL(
                  '/oauth2/default/v1/authorize',
                  `https://${lightdashConfig.auth.okta.oktaDomain}`,
              ).href,
              tokenURL: new URL(
                  '/oauth2/default/v1/token',
                  `https://${lightdashConfig.auth.okta.oktaDomain}`,
              ).href,
              userInfoURL: new URL(
                  '/oauth2/default/v1/userinfo',
                  `https://${lightdashConfig.auth.okta.oktaDomain}`,
              ).href,
              passReqToCallback: true,
          },
          async (req, issuer, profile, done) => {
              try {
                  const { inviteCode } = req.session.oauth || {};
                  req.session.oauth = {};
                  const [{ value: email }] = profile.emails;
                  const { id: subject } = profile;
                  if (!(email && subject)) {
                      return done(null, false, {
                          message: 'Could not parse authentication token',
                      });
                  }
                  const [firstName, lastName] = (
                      profile.displayName || ''
                  ).split();
                  const openIdUser: OpenIdUser = {
                      openId: {
                          issuer,
                          email,
                          subject,
                          firstName,
                          lastName,
                      },
                  };
                  const user = await userService.loginWithOpenId(
                      openIdUser,
                      req.user,
                      inviteCode,
                  );
                  return done(null, user);
              } catch (e) {
                  Logger.warn(`Failed to authorize user. ${e}`);
                  if (e instanceof LightdashError) {
                      return done(e);
                  }
                  return done(null, false, {
                      message: 'Failed to authorize user',
                  });
              }
          },
      );
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
    passport.authenticate('headerapikey', { session: false })(req, res, next);
};
