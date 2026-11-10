import {
    ApiConnectorType,
    getMetaAdsInsightsPath,
    META_ADS_ORIGIN,
} from '@lightdash/common';
import { type TokenLiveSourceForm } from './tokenLiveSource';

const AD_ACCOUNT_ID = /^\d{1,20}$/;

export const META_ADS_TOKEN_FORM: TokenLiveSourceForm = {
    label: 'Meta Ads',
    defaultName: 'Meta Ads',
    description:
        'AI agents read campaign, ad set and ad performance from one ad account live. Use a system user access token with only the ads_read permission.',
    origin: META_ADS_ORIGIN,
    account: {
        label: 'Ad account ID',
        description: 'The number after act= in your Ads Manager URL',
        placeholder: '1234567890',
        invalidMessage: 'Enter the number from act= in your Ads Manager URL',
        // Ads Manager shows the account with an act_ prefix; the API path adds its own
        normalize: (value) => value.trim().replace(/^act_/i, ''),
        isValid: (value) => AD_ACCOUNT_ID.test(value),
    },
    tokenLabel: 'Access token',
    toApiSource: (adAccountId) => ({
        connector: ApiConnectorType.META_ADS,
        adAccountId,
    }),
    getAccountId: ({ apiSource }) =>
        apiSource?.connector === ApiConnectorType.META_ADS
            ? apiSource.adAccountId
            : '',
    getAccess: (adAccountId) => ({
        allowedMethods: ['GET'],
        allowedPathPrefixes: [getMetaAdsInsightsPath(adAccountId)],
        allowedContentTypes: ['application/json'],
    }),
    getTestRequest: (adAccountId) => ({
        method: 'GET',
        path: getMetaAdsInsightsPath(adAccountId),
        query: { fields: 'spend', date_preset: 'last_7d', limit: '1' },
    }),
};
