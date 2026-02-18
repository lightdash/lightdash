/// <reference path="../../../@types/passport-openidconnect.d.ts" />
/// <reference path="../../../@types/express-session.d.ts" />
import {
    AnyType,
    ForbiddenError,
    OpenIdIdentityIssuerType,
    OpenIdUser,
    ParameterError,
} from '@lightdash/common';
import { createHash } from 'crypto';
import { Strategy as OAuth2Strategy, VerifyCallback } from 'passport-oauth2';
import { URL } from 'url';
import { lightdashConfig } from '../../../config/lightdashConfig';
import Logger from '../../../logging/logger';

type DatabricksStrategyConfig = {
    authorizationURL: string;
    tokenURL: string;
    issuer: string;
    clientId: string;
    clientSecret?: string;
};

const normalizeDatabricksHost = (serverHostName: string): string => {
    const trimmed = serverHostName.trim();
    const parsed = new URL(
        trimmed.startsWith('http://') || trimmed.startsWith('https://')
            ? trimmed
            : `https://${trimmed}`,
    );
    if (!parsed.host) {
        throw new ParameterError('Invalid Databricks serverHostName');
    }
    if (parsed.pathname !== '/' || parsed.search || parsed.hash) {
        throw new ParameterError(
            'Databricks serverHostName must not include a path, query string, or hash',
        );
    }
    return parsed.host;
};

export const getDatabricksOidcEndpointsFromHost = (serverHostName: string) => {
    const host = normalizeDatabricksHost(serverHostName);
    const issuer = `https://${host}`;
    return {
        host,
        issuer,
        authorizationURL: `${issuer}/oidc/v1/authorize`,
        tokenURL: `${issuer}/oidc/v1/token`,
    };
};

export const getDatabricksStrategyName = ({
    host,
    clientId,
}: {
    host: string;
    clientId: string;
}) =>
    `databricks-${createHash('sha256')
        .update(`${host}:${clientId}`)
        .digest('hex')
        .slice(0, 16)}`;

export const createDatabricksStrategy = ({
    authorizationURL,
    tokenURL,
    issuer,
    clientId,
    clientSecret,
}: DatabricksStrategyConfig) =>
    new OAuth2Strategy(
        {
            authorizationURL,
            tokenURL,
            clientID: clientId,
            // U2M OAuth can use a public client without a secret, but passport-oauth2 requires this field
            clientSecret: clientSecret || '',
            callbackURL: new URL(
                `/api/v1${lightdashConfig.auth.databricks.callbackPath}`,
                lightdashConfig.siteUrl,
            ).href,
            scope: ['sql', 'offline_access'],
            passReqToCallback: true,
            // PKCE is required for Databricks U2M OAuth
            pkce: true,
            state: true,
        },
        async (
            req: Express.Request,
            accessToken: string,
            refreshToken: string,
            profile: AnyType,
            done: VerifyCallback,
        ) => {
            try {
                if (!lightdashConfig.license.licenseKey) {
                    throw new ForbiddenError(
                        `Enterprise license required for databricks authentication`,
                    );
                }

                const loggedUser = req.user;
                if (loggedUser === undefined) {
                    throw new ForbiddenError('User not authenticated');
                }

                // Databricks OAuth doesn't return user profile in the token response
                // We use the existing logged-in user's information
                const openIdUser: OpenIdUser = {
                    openId: {
                        subject: loggedUser.userUuid,
                        issuer,
                        issuerType: OpenIdIdentityIssuerType.DATABRICKS,
                        email: loggedUser.email!,
                        firstName: loggedUser.firstName,
                        lastName: loggedUser.lastName,
                    },
                };

                if (!refreshToken) {
                    throw new Error(
                        'Databricks OAuth refresh token was not returned. Ensure offline_access scope is granted.',
                    );
                }

                Logger.info(
                    `Creating user warehouse credentials for Databricks`,
                );
                const userCredentials = await req.services
                    .getUserService()
                    .createDatabricksWarehouseCredentials(
                        req.user!,
                        refreshToken,
                        {
                            projectUuid:
                                req.session.oauth?.databricks?.projectUuid,
                            projectName:
                                req.session.oauth?.databricks?.projectName,
                            serverHostName:
                                req.session.oauth?.databricks?.serverHostName,
                            credentialsName:
                                req.session.oauth?.databricks?.credentialsName,
                        },
                    );

                if (
                    userCredentials &&
                    req.session.oauth?.databricks?.projectUuid
                ) {
                    try {
                        await req.services
                            .getProjectService()
                            .upsertProjectCredentialsPreference(
                                req.user!,
                                req.session.oauth.databricks.projectUuid,
                                userCredentials.uuid,
                            );
                    } catch (e) {
                        Logger.warn(
                            `Failed to set Databricks credentials preference for project ${req.session.oauth.databricks.projectUuid}`,
                            e,
                        );
                    }
                }

                const user = await req.services
                    .getUserService()
                    .loginWithOpenId(
                        openIdUser,
                        req.user,
                        undefined,
                        refreshToken,
                    );
                done(null, user);
            } catch (error) {
                done(error);
            }
        },
    );

// Databricks U2M OAuth doesn't require a client secret (public client)
// and requires PKCE (Proof Key for Code Exchange)
// https://docs.databricks.com/en/dev-tools/auth/oauth-u2m.html
export const databricksPassportStrategy = !(
    lightdashConfig.auth.databricks.clientId &&
    lightdashConfig.auth.databricks.authorizationEndpoint &&
    lightdashConfig.auth.databricks.tokenEndpoint
)
    ? undefined
    : createDatabricksStrategy({
          authorizationURL:
              lightdashConfig.auth.databricks.authorizationEndpoint,
          tokenURL: lightdashConfig.auth.databricks.tokenEndpoint,
          issuer: lightdashConfig.auth.databricks.authorizationEndpoint,
          clientId: lightdashConfig.auth.databricks.clientId,
          clientSecret: lightdashConfig.auth.databricks.clientSecret,
      });
