/// <reference path="../@types/passport-openidconnect.d.ts" />
/// <reference path="../@types/express-session.d.ts" />
import {
    ArgumentsOf,
    AuthorizationError,
    isOpenIdUser,
    isSessionUser,
    LightdashError,
    LightdashMode,
    OpenIdIdentityIssuerType,
    OpenIdUser,
    SessionUser,
} from '@lightdash/common';
import { Request, RequestHandler } from 'express';
import { generators, Issuer, UserinfoResponse } from 'openid-client';
import type { Profile as PassportProfile } from 'passport';
import passport from 'passport';
import {
    GoogleCallbackParameters,
    Profile,
    Strategy as GoogleStrategy,
    VerifyCallback,
} from 'passport-google-oauth20';
import { HeaderAPIKeyStrategy } from 'passport-headerapikey';
import { Strategy as LocalStrategy } from 'passport-local';
import {
    Strategy as OpenIDConnectStrategy,
    VerifyFunctionWithRequest,
} from 'passport-openidconnect';
import { Strategy } from 'passport-strategy';
import path from 'path';
import { URL } from 'url';
import { lightdashConfig } from '../config/lightdashConfig';
import Logger from '../logging/logger';
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

const createOpenIdUserFromUserInfo = (
    userInfo: UserinfoResponse,
    issuer: string,
    issuerType: OpenIdIdentityIssuerType,
    fail: OpenIDClientOktaStrategy['fail'],
) => {
    if (!userInfo.email || !userInfo.sub) {
        return fail(
            {
                message: 'Could not parse authentication token',
            },
            401,
        );
    }

    const displayName = userInfo.name || '';
    const [fallbackFirstName, fallbackLastName] = displayName.split(' ');
    const firstName = userInfo.given_name || fallbackFirstName;
    const lastName = userInfo.family_name || fallbackLastName;

    const openIdUser: OpenIdUser = {
        openId: {
            issuer: issuer || '',
            email: userInfo.email,
            subject: userInfo.sub,
            firstName,
            lastName,
            issuerType: issuerType || '',
        },
    };

    if (userInfo?.groups && Array.isArray(userInfo.groups)) {
        openIdUser.openId.groups = userInfo.groups;
    }

    return openIdUser;
};

const createOpenIdUserFromProfile = (
    profile: PassportProfile,
    issuer: string,
    issuerType: OpenIdIdentityIssuerType,
    done: ArgumentsOf<VerifyFunctionWithRequest>['3'],
) => {
    const email = profile.emails?.[0]?.value;
    const subject = profile.id;
    if (!(email && subject)) {
        return done(null, false, {
            message: 'Could not parse authentication token',
        });
    }

    const displayName = profile.displayName || '';
    const [fallbackFirstName, fallbackLastName] = displayName.split(' ');
    const firstName = profile.name?.givenName || fallbackFirstName;
    const lastName = profile.name?.familyName || fallbackLastName;

    const openIdUser: OpenIdUser = {
        openId: {
            issuer: issuer || '',
            email,
            subject,
            firstName,
            lastName,
            issuerType: issuerType || '',
        },
    };

    return openIdUser;
};

const setupClient = async () => {
    const { okta } = lightdashConfig.auth;

    const oktaIssuerUri = new URL(
        okta.authorizationServerId
            ? `/oauth2/${okta.authorizationServerId}`
            : '',
        `https://${okta.oktaDomain}`,
    ).href;

    const oktaIssuer = await Issuer.discover(oktaIssuerUri);

    const redirectUri = new URL(
        `/api/v1${lightdashConfig.auth.okta.callbackPath}`,
        lightdashConfig.siteUrl,
    ).href;

    const client = new oktaIssuer.Client({
        client_id: okta.oauth2ClientId ?? '',
        client_secret: okta.oauth2ClientSecret,
        redirect_uris: [redirectUri],
        response_types: ['code'],
    });

    return client;
};

export class OpenIDClientOktaStrategy extends Strategy {
    async authenticate(req: Request) {
        try {
            const client = await setupClient();

            const redirectUri = new URL(
                `/api/v1${lightdashConfig.auth.okta.callbackPath}`,
                lightdashConfig.siteUrl,
            ).href;

            const params = client.callbackParams(req);
            const tokenSet = await client.callback(redirectUri, params, {
                code_verifier: req.session.oauth?.codeVerifier,
                state: req.session.oauth?.state,
            });

            const userInfo = tokenSet.access_token
                ? await client.userinfo(tokenSet.access_token)
                : undefined;

            if (!userInfo) return this.fail(401);

            try {
                const { inviteCode } = req.session.oauth || {};
                req.session.oauth = {};

                const openIdUser = createOpenIdUserFromUserInfo(
                    userInfo,
                    tokenSet.claims().iss,
                    OpenIdIdentityIssuerType.OKTA,
                    this.fail,
                );

                if (openIdUser) {
                    const user = await userService.loginWithOpenId(
                        openIdUser,
                        req.user,
                        inviteCode,
                    );
                    return this.success(user);
                }

                return this.fail(
                    { message: 'Unexpected error processing user information' },
                    401,
                );
            } catch (e) {
                if (e instanceof LightdashError) {
                    return this.fail({ message: e.message }, 401);
                }
                Logger.warn(`Unexpected error while authorizing user: ${e}`);
                return this.error(e);
            }
        } catch (err) {
            return this.error(err);
        }
        return this.fail(401);
    }
}

export const initiateOktaOpenIdLogin: RequestHandler = async (
    req,
    res,
    next,
) => {
    try {
        const client = await setupClient();

        const redirectUri = new URL(
            `/api/v1${lightdashConfig.auth.okta.callbackPath}`,
            lightdashConfig.siteUrl,
        ).href;

        const state = generators.state();
        const codeVerifier = generators.codeVerifier();
        const codeChallenge = generators.codeChallenge(codeVerifier);

        const authorizationUrl = client.authorizationUrl({
            redirect_uri: redirectUri,
            response_type: 'code',
            scope: 'openid profile email',
            code_challenge: codeChallenge,
            code_challenge_method: 'S256',
            state,
        });

        req.session.oauth = {
            ...(req.session.oauth ?? {}),
            codeVerifier,
            state,
        };

        return res.redirect(authorizationUrl);
    } catch (e) {
        return next(e);
    }
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
          async (
              req: Express.Request,
              accessToken: string,
              refreshToken: string,
              params: GoogleCallbackParameters,
              profile: Profile,
              done: VerifyCallback,
          ) => {
              try {
                  const issuer = 'https://accounts.google.com';
                  const { inviteCode } = req.session.oauth || {};
                  const [{ value: email }] = profile.emails || [];
                  const { id: subject } = profile;
                  if (!(email && subject)) {
                      return done(null, undefined, {
                          message: 'Could not parse authentication token',
                      });
                  }

                  const normalisedIssuer = new URL('/', issuer).origin; // normalise issuer
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

                  const user = await userService.loginWithOpenId(
                      openIdUser,
                      req.user,
                      inviteCode,
                      refreshToken,
                  );
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
          },
      );

const genericOidcHandler =
    (
        issuerType: OpenIdUser['openId']['issuerType'],
    ): VerifyFunctionWithRequest =>
    async (req, issuer, profile, done) => {
        try {
            const { inviteCode } = req.session.oauth || {};
            req.session.oauth = {};

            const openIdUser = createOpenIdUserFromProfile(
                profile,
                issuer,
                issuerType,
                done,
            );

            if (openIdUser) {
                const user = await userService.loginWithOpenId(
                    openIdUser,
                    req.user,
                    inviteCode,
                );
                return done(null, user);
            }
            return done(null, false, {
                message: 'Unexpected error processing user information',
            });
        } catch (e) {
            if (e instanceof LightdashError) {
                return done(null, false, { message: e.message });
            }
            Logger.warn(`Unexpected error while authorizing user: ${e}`);
            return done(null, false, {
                message: 'Unexpected error authorizing user',
            });
        }
    };

export const isOktaPassportStrategyAvailableToUse = !!(
    lightdashConfig.auth.okta.oauth2ClientId &&
    lightdashConfig.auth.okta.oauth2ClientSecret &&
    lightdashConfig.auth.okta.oauth2Issuer &&
    lightdashConfig.auth.okta.oktaDomain
);

export const azureAdPassportStrategy = !(
    lightdashConfig.auth.azuread.oauth2ClientId &&
    lightdashConfig.auth.azuread.oauth2ClientSecret &&
    lightdashConfig.auth.azuread.oauth2TenantId
)
    ? undefined
    : new OpenIDConnectStrategy(
          {
              issuer: `https://login.microsoftonline.com/${lightdashConfig.auth.azuread.oauth2TenantId}/v2.0`,
              authorizationURL: `https://login.microsoftonline.com/${lightdashConfig.auth.azuread.oauth2TenantId}/oauth2/v2.0/authorize`,
              tokenURL: `https://login.microsoftonline.com/${lightdashConfig.auth.azuread.oauth2TenantId}/oauth2/v2.0/token`,
              userInfoURL: 'https://graph.microsoft.com/oidc/userinfo',
              clientID: lightdashConfig.auth.azuread.oauth2ClientId,
              clientSecret: lightdashConfig.auth.azuread.oauth2ClientSecret,
              callbackURL: new URL(
                  `/api/v1${lightdashConfig.auth.azuread.callbackPath}`,
                  lightdashConfig.siteUrl,
              ).href,
              passReqToCallback: true,
          },
          genericOidcHandler(OpenIdIdentityIssuerType.AZUREAD),
      );

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
