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
import {
    BaseClient,
    generators,
    Issuer,
    Strategy as OpenIdClientStrategy,
    StrategyVerifyCallback,
    UserinfoResponse,
} from 'openid-client';
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
import { URL } from 'url';
import { buildJwtKeySet } from '../config/jwtKeySet';
import { lightdashConfig } from '../config/lightdashConfig';
import Logger from '../logging/logger';
import type { UserService } from '../services/UserService';

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

/**
 * For now, we use the serviceRepository singleton to access the UserService instance,
 * which in turn is also globally shared.
 *
 * At some point, we'll have to ensure that we can access a service repository instance
 * at this stage, OR have an "anonymous context" service repository instance for this
 * stage of the request.
 */
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

export const getLoginHint = (req: Request) =>
    req.query?.login_hint && typeof req.query.login_hint === 'string'
        ? req.query.login_hint
        : undefined;

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
            email: userInfo.email,
            issuer: issuer || '',
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
    const email = profile.emails?.[0]?.value || profile.email;
    const subject = profile.id || profile.sub;

    if (!(email && subject)) {
        return done(null, false, {
            message: 'Could not parse authentication token',
        });
    }

    const displayName = profile.displayName || '';
    const [fallbackFirstName, fallbackLastName] = displayName.split(' ');
    const firstName =
        profile.name?.givenName || profile.given_name || fallbackFirstName;
    const lastName =
        profile.name?.familyName || profile.family_name || fallbackLastName;

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

const setupOktaIssuerClient = async () => {
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
            const client = await setupOktaIssuerClient();

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
                    const user = await req.services
                        .getUserService()
                        .loginWithOpenId(openIdUser, req.user, inviteCode);
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
    }
}

export const initiateOktaOpenIdLogin: RequestHandler = async (
    req,
    res,
    next,
) => {
    try {
        const client = await setupOktaIssuerClient();

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
            scope: 'openid profile email'.concat(
                lightdashConfig.auth.okta.extraScopes
                    ? ` ${lightdashConfig.auth.okta.extraScopes}`
                    : '',
            ),
            code_challenge: codeChallenge,
            code_challenge_method: 'S256',
            login_hint: getLoginHint(req),
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

export const localPassportStrategy = ({
    userService,
}: {
    userService: UserService;
}) =>
    new LocalStrategy(
        { usernameField: 'email', passwordField: 'password' },
        async (email, password, done) => {
            try {
                const user = await userService.loginWithPassword(
                    email,
                    password,
                );
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
export const apiKeyPassportStrategy = ({
    userService,
}: {
    userService: UserService;
}) =>
    new HeaderAPIKeyStrategy(
        { header: 'Authorization', prefix: 'ApiKey ' },
        true,
        async (token, done) => {
            try {
                const user = await userService.loginWithPersonalAccessToken(
                    token,
                );
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
              pkce: true,
              state: true,
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

                  const user = await req.services
                      .getUserService()
                      .loginWithOpenId(
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
        issuerOverride?: string,
    ): VerifyFunctionWithRequest =>
    async (req, issuer, profile, done) => {
        try {
            const { inviteCode } = req.session.oauth || {};
            req.session.oauth = {};

            const openIdUser = createOpenIdUserFromProfile(
                profile,
                issuerOverride || issuer,
                issuerType,
                done,
            );

            if (openIdUser) {
                const user = await req.services
                    .getUserService()
                    .loginWithOpenId(openIdUser, req.user, inviteCode);
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

/**
 * Azure-specific (but also mostly generic) implementation of private_key_jks
 * token authentication, using openid-client.
 *
 * Requires its own strategy since this method is not supported by OpenIdConnect.
 */
const azureAdPrivateKeyJksStrategy = async (): Promise<
    OpenIdClientStrategy<unknown, BaseClient>
> => {
    Logger.info('Using azureAdPrivateKeyJksStrategy');

    const { azuread } = lightdashConfig.auth;

    /**
     * We get all the information we need via issuer discovery, which we can also
     * use further down to create a client instance.
     */
    const issuer = await Issuer.discover(
        azuread.openIdConnectMetadataEndpoint!,
    );

    /**
     * Build the JWT Key Set out of whatever options are available - this may be
     * file paths or actual pem-encoded contents.
     */
    const { jwk } = await buildJwtKeySet({
        certificateFilePath: azuread.x509PublicKeyCertPath,
        certificateFile: azuread.x509PublicKeyCert,
        keyFilePath: azuread.privateKeyFilePath,
        keyFile: azuread.privateKeyFile,
    });

    /**
     * Azure expects the key's identifier (kid) to be the same value as the
     * certificate SHA-1 thumbprint, base64-encoded, for purposes of key
     * matching.
     *
     * Confusingly, it may also complain about the x5t and x5c claims, but we
     * can ignore it here and simply override whatever value we have from the
     * underlying private key, and node-openid-client will know to include it
     * as part of the jwt header.
     *
     * buildJwtKeySet handles this part of the process, so we're left with
     * building a jwks:
     */
    const jwks = {
        keys: [jwk],
    };

    const client = new issuer.Client(
        {
            client_id: azuread.oauth2ClientId!,
            token_endpoint_auth_signing_alg: 'RS256',
            token_endpoint_auth_method: 'private_key_jwt',
        },
        jwks,
    );

    return new OpenIdClientStrategy(
        {
            client,
            usePKCE: true,
            passReqToCallback: true,
            params: {
                redirect_uri: new URL(
                    `/api/v1${azuread.callbackPath}`,
                    lightdashConfig.siteUrl,
                ).href,
            },
            extras: {
                clientAssertionPayload: {
                    /**
                     * AzureAD only expects a single audience value, but node-openid-client may
                     * set more than one value here - we override this part of the payload to
                     * make Azure happy:
                     */
                    aud: issuer.metadata.issuer,

                    /** AzureAD complains if this is missing: */
                    typ: 'JWT',
                },
            },
        },

        /**
         * This is compatible, but types differ from what's otherwise expected.
         */
        genericOidcHandler(
            OpenIdIdentityIssuerType.AZUREAD,
            new URL(azuread.openIdConnectMetadataEndpoint!).origin,
        ) as unknown as StrategyVerifyCallback<unknown>,
    );
};

/**
 * Creates the appropriate AzureAd passport strategy based on the available configuration.
 */
export const createAzureAdPassportStrategy = () => {
    const { azuread } = lightdashConfig.auth;

    /**
     * Figure out which passport strategy we want to use, depending on if we're
     * using the secret key flow, or a standard clientId/clientSecret pair.
     */
    if (
        azuread.oauth2ClientId &&
        azuread.oauth2ClientSecret &&
        azuread.oauth2TenantId
    ) {
        return new OpenIDConnectStrategy(
            {
                issuer: `https://login.microsoftonline.com/${azuread.oauth2TenantId}/v2.0`,
                authorizationURL: `https://login.microsoftonline.com/${azuread.oauth2TenantId}/oauth2/v2.0/authorize`,
                tokenURL: `https://login.microsoftonline.com/${azuread.oauth2TenantId}/oauth2/v2.0/token`,
                userInfoURL: 'https://graph.microsoft.com/oidc/userinfo',
                clientID: azuread.oauth2ClientId,
                clientSecret: azuread.oauth2ClientSecret,
                callbackURL: new URL(
                    `/api/v1${azuread.callbackPath}`,
                    lightdashConfig.siteUrl,
                ).href,
                passReqToCallback: true,
            },
            genericOidcHandler(OpenIdIdentityIssuerType.AZUREAD),
        );
    }

    if (
        azuread.oauth2ClientId &&
        /** We don't want to use this method if a secret is provided */
        !azuread.oauth2ClientSecret &&
        azuread.openIdConnectMetadataEndpoint &&
        (azuread.x509PublicKeyCertPath || azuread.x509PublicKeyCert) &&
        (azuread.privateKeyFilePath || azuread.privateKeyFile)
    ) {
        return azureAdPrivateKeyJksStrategy();
    }

    throw new Error('Could not configure AzureAd passport strategy');
};

export const isAzureAdPassportStrategyAvailableToUse =
    !!lightdashConfig.auth.azuread.oauth2ClientId;

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

export const isGenericOidcPassportStrategyAvailableToUse =
    lightdashConfig.auth.oidc.clientId &&
    lightdashConfig.auth.oidc.metadataDocumentEndpoint;

export const createGenericOidcPassportStrategy = async () => {
    const { oidc } = lightdashConfig.auth;
    const issuer = await Issuer.discover(oidc.metadataDocumentEndpoint!);

    const hasJwtConfig =
        (oidc.privateKeyFile || oidc.privateKeyFilePath) &&
        (oidc.x509PublicKeyCert || oidc.x509PublicKeyCertPath);

    const keySet = hasJwtConfig
        ? await buildJwtKeySet({
              certificateFilePath: oidc.x509PublicKeyCertPath,
              certificateFile: oidc.x509PublicKeyCert,
              keyFilePath: oidc.privateKeyFilePath,
              keyFile: oidc.privateKeyFile,
          })
        : undefined;

    const client = new issuer.Client(
        {
            client_id: oidc.clientId!,
            client_secret: oidc.clientSecret,
            token_endpoint_auth_signing_alg: oidc.authSigningAlg,
            token_endpoint_auth_method: oidc.authMethod,
        },
        keySet ? { keys: [keySet.jwk] } : undefined,
    );

    return new OpenIdClientStrategy(
        {
            client,
            usePKCE: !!keySet,
            passReqToCallback: true,
            params: {
                redirect_uri: new URL(
                    `/api/v1${oidc.callbackPath}`,
                    lightdashConfig.siteUrl,
                ).href,
            },
            extras: {
                ...(keySet
                    ? {
                          clientAssertionPayload: {
                              aud: issuer.metadata.issuer,
                              typ: 'JWT',
                          },
                      }
                    : {}),
            },
        },

        /**
         * This is compatible, but types differ from what's otherwise expected.
         */
        genericOidcHandler(
            OpenIdIdentityIssuerType.GENERIC_OIDC,
            issuer.metadata.issuer,
        ) as unknown as StrategyVerifyCallback<unknown>,
    );
};

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
