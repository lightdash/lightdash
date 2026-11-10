const AUTHORIZE_URL = 'https://www.linkedin.com/oauth/v2/authorization';
const CALLBACK_PATH = '/api/v1/ee/linkedin/oauth/callback';
// r_ads reads the ad account and its campaigns; r_ads_reporting reads analytics
export const LINKEDIN_ADS_OAUTH_SCOPES = ['r_ads', 'r_ads_reporting'];

export const getLinkedInAdsOAuthRedirectUri = (siteUrl: string) =>
    new URL(CALLBACK_PATH, siteUrl).href;

export const buildLinkedInAdsAuthorizeUrl = ({
    clientId,
    redirectUri,
    state,
}: {
    clientId: string;
    redirectUri: string;
    state: string;
}): string => {
    const url = new URL(AUTHORIZE_URL);
    url.search = new URLSearchParams({
        response_type: 'code',
        client_id: clientId,
        redirect_uri: redirectUri,
        scope: LINKEDIN_ADS_OAUTH_SCOPES.join(' '),
        state,
    }).toString();
    return url.href;
};
