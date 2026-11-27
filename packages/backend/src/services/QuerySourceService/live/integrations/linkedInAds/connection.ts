import {
    ApiConnectorType,
    LIVE_INTEGRATION_CATALOG,
    ParameterError,
} from '@lightdash/common';
import { readRule, type LiveConnection } from '../../sdk';
import {
    getLinkedInAdsAccountPath,
    LINKEDIN_ADS_ANALYTICS_PATH,
    LINKEDIN_ADS_ORIGIN,
    LINKEDIN_ADS_REQUEST_HEADERS,
    LINKEDIN_ADS_TOKEN_URL,
} from './api';

const LINKEDIN_AD_ACCOUNT_ID = /^\d{1,20}$/;
const CATALOG = LIVE_INTEGRATION_CATALOG[ApiConnectorType.LINKEDIN_ADS];

export const linkedInAdsConnection: LiveConnection<ApiConnectorType.LINKEDIN_ADS> =
    {
        settings: CATALOG.settings,
        origins: [LINKEDIN_ADS_ORIGIN],
        access: ({ adAccountId }) => ({
            rules: [
                readRule('GET', LINKEDIN_ADS_ANALYTICS_PATH),
                readRule('GET', getLinkedInAdsAccountPath(adAccountId)),
            ],
            headers: LINKEDIN_ADS_REQUEST_HEADERS,
        }),
        checkAuth: ({ type, oauthTokenUrl }) => {
            if (
                type !== 'oauth_authorization_code' ||
                oauthTokenUrl !== LINKEDIN_ADS_TOKEN_URL
            ) {
                throw new ParameterError(
                    'LinkedIn Ads connections authenticate by signing in with LinkedIn',
                );
            }
        },
        validate: ({ adAccountId }) => {
            if (!LINKEDIN_AD_ACCOUNT_ID.test(adAccountId)) {
                throw new ParameterError(
                    'The LinkedIn ad account ID must be a number',
                );
            }
        },
        describeTarget: ({ settings: { adAccountId } }) =>
            `LinkedIn Ads account ${adAccountId}`,
    };
