/// <reference path="../../../@types/passport-openidconnect.d.ts" />
/// <reference path="../../../@types/express-session.d.ts" />
import {
    ArgumentsOf,
    LightdashError,
    OpenIdIdentityIssuerType,
    OpenIdUser,
} from '@lightdash/common';
import {
    Issuer,
    Strategy as OpenIdClientStrategy,
    StrategyVerifyCallback,
} from 'openid-client';
import type { Profile as PassportProfile } from 'passport';
import { VerifyFunctionWithRequest } from 'passport-openidconnect';
import { URL } from 'url';
import { buildJwtKeySet } from '../../../config/jwtKeySet';
import { lightdashConfig } from '../../../config/lightdashConfig';
import Logger from '../../../logging/logger';

export const isGenericOidcPassportStrategyAvailableToUse =
    lightdashConfig.auth.oidc.clientId &&
    lightdashConfig.auth.oidc.metadataDocumentEndpoint;

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

export const genericOidcHandler =
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
