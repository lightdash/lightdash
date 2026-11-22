import {
    SALESFORCE_LOGIN_ORIGINS,
    type SalesforceEnvironment,
} from '@lightdash/common';

const CALLBACK_PATH = '/api/v1/ee/salesforce/oauth/callback';
// api reads data through the REST API; refresh_token keeps the source signed in
export const SALESFORCE_OAUTH_SCOPES = ['api', 'refresh_token'];

export const getSalesforceOAuthRedirectUri = (siteUrl: string) =>
    new URL(CALLBACK_PATH, siteUrl).href;

/**
 * Salesforce's consent screen, on the production or sandbox login host. PKCE is
 * always sent: Connected Apps that require it accept it, the rest ignore it.
 */
export const buildSalesforceAuthorizeUrl = ({
    clientId,
    redirectUri,
    state,
    codeChallenge,
    environment,
}: {
    environment: SalesforceEnvironment;
    clientId: string;
    redirectUri: string;
    state: string;
    codeChallenge: string;
}): string => {
    const url = new URL(
        '/services/oauth2/authorize',
        SALESFORCE_LOGIN_ORIGINS[environment],
    );
    url.search = new URLSearchParams({
        response_type: 'code',
        client_id: clientId,
        redirect_uri: redirectUri,
        scope: SALESFORCE_OAUTH_SCOPES.join(' '),
        state,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
    }).toString();
    return url.href;
};
