/// <reference path="../../../@types/passport-openidconnect.d.ts" />
/// <reference path="../../../@types/express-session.d.ts" />
import { OpenIdIdentityIssuerType } from '@lightdash/common';
import {
    BaseClient,
    Issuer,
    Strategy as OpenIdClientStrategy,
    StrategyVerifyCallback,
} from 'openid-client';
import { Strategy as OpenIDConnectStrategy } from 'passport-openidconnect';
import { URL } from 'url';
import { buildJwtKeySet } from '../../../config/jwtKeySet';
import { lightdashConfig } from '../../../config/lightdashConfig';
import Logger from '../../../logging/logger';
import { genericOidcHandler } from './oidcStrategy';

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
     * Use our key to build a key set, as required by openid-client
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
