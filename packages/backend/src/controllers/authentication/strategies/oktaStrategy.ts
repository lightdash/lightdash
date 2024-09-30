/// <reference path="../../../@types/passport-openidconnect.d.ts" />
/// <reference path="../../../@types/express-session.d.ts" />
import {
    LightdashError,
    OpenIdIdentityIssuerType,
    OpenIdUser,
} from '@lightdash/common';
import { Request, RequestHandler } from 'express';
import { generators, Issuer, UserinfoResponse } from 'openid-client';
import { Strategy } from 'passport-strategy';
import { URL } from 'url';
import { lightdashConfig } from '../../../config/lightdashConfig';
import Logger from '../../../logging/logger';
import { getLoginHint } from '../utils';

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

export const isOktaPassportStrategyAvailableToUse = !!(
    lightdashConfig.auth.okta.oauth2ClientId &&
    lightdashConfig.auth.okta.oauth2ClientSecret &&
    lightdashConfig.auth.okta.oauth2Issuer &&
    lightdashConfig.auth.okta.oktaDomain
);
