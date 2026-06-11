/// <reference path="../../../@types/passport-openidconnect.d.ts" />
/// <reference path="../../../@types/express-session.d.ts" />
import {
    LightdashError,
    OktaSsoConfig,
    OpenIdIdentityIssuerType,
    OpenIdUser,
    OrganizationSsoProvider,
    UnexpectedServerError,
} from '@lightdash/common';
import * as Sentry from '@sentry/node';
import { Request, RequestHandler } from 'express';
import isString from 'lodash/isString';
import { generators, Issuer, UserinfoResponse } from 'openid-client';
import { Strategy } from 'passport-strategy';
import { URL } from 'url';
import { lightdashConfig } from '../../../config/lightdashConfig';
import Logger from '../../../logging/logger';
import { getLoginHint } from '../utils';

const getIssuerHint = (req: Request) =>
    isString(req.query?.iss) ? req.query.iss : undefined;

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

/**
 * Builds the Okta `openid-client` Client for a given config. Used by both the
 * env-based (single-tenant) path and the per-org DB-config path, so the config
 * is always passed in explicitly rather than read from `lightdashConfig`.
 */
const setupOktaIssuerClient = async (config: OktaSsoConfig) => {
    const oktaIssuerUri = new URL(
        config.authorizationServerId
            ? `/oauth2/${config.authorizationServerId}`
            : '',
        `https://${config.oktaDomain}`,
    ).href;

    const oktaIssuer = await Issuer.discover(oktaIssuerUri);

    const redirectUri = new URL(
        `/api/v1${lightdashConfig.auth.okta.callbackPath}`,
        lightdashConfig.siteUrl,
    ).href;

    const client = new oktaIssuer.Client({
        client_id: config.oauth2ClientId,
        client_secret: config.oauth2ClientSecret,
        redirect_uris: [redirectUri],
        response_types: ['code'],
    });

    return client;
};

/**
 * Builds an OktaSsoConfig from the instance-level env config, or returns
 * undefined when the instance isn't configured for Okta. Retained as a
 * fallback for single-tenant env-driven instances.
 */
export const getOktaConfigFromEnv = (): OktaSsoConfig | undefined => {
    const { okta } = lightdashConfig.auth;
    if (
        okta.oauth2ClientId &&
        okta.oauth2ClientSecret &&
        okta.oauth2Issuer &&
        okta.oktaDomain
    ) {
        return {
            oauth2Issuer: okta.oauth2Issuer,
            oktaDomain: okta.oktaDomain,
            oauth2ClientId: okta.oauth2ClientId,
            oauth2ClientSecret: okta.oauth2ClientSecret,
            authorizationServerId: okta.authorizationServerId ?? null,
            extraScopes: okta.extraScopes ?? null,
        };
    }
    return undefined;
};

/**
 * Resolves the Okta config to use for this request. Prefers a per-org
 * DB-stored config matching the email login hint; falls back to the
 * instance-level env config. Returns the resolved organization (if any) so
 * the callback can re-resolve the same config from the session.
 */
export const resolveOktaConfig = async (
    req: Request,
): Promise<
    { config: OktaSsoConfig; organizationUuid: string | null } | undefined
> => {
    const email = getLoginHint(req);
    if (email) {
        const method = await req.services
            .getOrganizationSsoService()
            .findEnabledMethodForEmail(email, OrganizationSsoProvider.OKTA);
        if (method) {
            return {
                config: method.config,
                organizationUuid: method.organizationUuid,
            };
        }
    }
    const issuer = getIssuerHint(req);
    if (issuer) {
        const method = await req.services
            .getOrganizationSsoService()
            .findEnabledOktaMethodForIssuer(issuer);
        if (method) {
            return {
                config: method.config,
                organizationUuid: method.organizationUuid,
            };
        }
    }
    const envConfig = getOktaConfigFromEnv();
    if (envConfig) {
        return { config: envConfig, organizationUuid: null };
    }
    return undefined;
};

export class OpenIDClientOktaStrategy extends Strategy {
    async authenticate(req: Request) {
        try {
            if (req.query.error) {
                if (req.query.error === 'access_denied') {
                    return this.fail(
                        {
                            message:
                                'Your Okta account doesn’t currently have access to Lightdash. Please contact support or your Okta administrator to enable access.',
                        },
                        401,
                    );
                }
                const errorMessage = `Okta authentication failed unexpectedly: ${req.query.error}, ${req.query.error_description}`;
                Sentry.captureException(
                    new UnexpectedServerError(errorMessage),
                );
                Logger.error(errorMessage);

                return this.fail(
                    {
                        message:
                            'Okta authentication failed. Please contact support.',
                    },
                    401,
                );
            }

            // Resolve the config used at login: the per-org config stored on
            // the session (if login was initiated for a per-org Okta method),
            // else the instance-level env config.
            const organizationUuid = req.session.oauth?.oktaOrganizationUuid;
            const config = organizationUuid
                ? await req.services
                      .getOrganizationSsoService()
                      .getConfigForOrganization(
                          organizationUuid,
                          OrganizationSsoProvider.OKTA,
                      )
                : getOktaConfigFromEnv();
            if (!config) {
                return this.fail(
                    { message: 'Okta SSO is not configured' },
                    404,
                );
            }

            const client = await setupOktaIssuerClient(config);

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
                        .loginWithOpenId(
                            openIdUser,
                            req.user,
                            inviteCode,
                            undefined,
                            {
                                ip: req.ip,
                                userAgent: req.get('user-agent'),
                            },
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
                if (e instanceof Error) return this.error(e);
                throw new UnexpectedServerError(
                    `Unexpected error while authorizing user: ${e}`,
                );
            }
        } catch (err) {
            if (err instanceof Error) return this.error(err);
            throw new UnexpectedServerError(
                `Unexpected error while authorizing user: ${err}`,
            );
        }
    }
}

export const initiateOktaOpenIdLogin: RequestHandler = async (
    req,
    res,
    next,
) => {
    try {
        const resolved = await resolveOktaConfig(req);
        if (!resolved) {
            res.status(404).json({
                status: 'error',
                message: 'Okta SSO is not configured',
            });
            return;
        }
        const { config, organizationUuid } = resolved;

        const client = await setupOktaIssuerClient(config);

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
                config.extraScopes ? ` ${config.extraScopes}` : '',
            ),
            code_challenge: codeChallenge,
            code_challenge_method: 'S256',
            login_hint: getLoginHint(req),
            state,
        });

        // Persist the resolved org so the callback re-resolves the same config
        // (the login hint isn't available on the provider's redirect back).
        req.session.oauth = {
            ...(req.session.oauth ?? {}),
            codeVerifier,
            state,
            oktaOrganizationUuid: organizationUuid ?? undefined,
        };

        res.redirect(authorizationUrl);
    } catch (e) {
        next(e);
    }
};
