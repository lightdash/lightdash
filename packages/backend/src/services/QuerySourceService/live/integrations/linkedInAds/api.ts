import {
    TooManyRequestsError,
    UnexpectedServerError,
    WarehouseConnectionError,
    WarehouseQueryError,
} from '@lightdash/common';
import { z } from 'zod';
import { type LiveHttpResponse } from '../../sdk';

export const LINKEDIN_ADS_ORIGIN = 'https://api.linkedin.com';
export const LINKEDIN_ADS_TOKEN_URL =
    'https://www.linkedin.com/oauth/v2/accessToken';
// Versions are supported for about a year; 202611 and 202610 are the newest
// documented (https://learn.microsoft.com/linkedin/marketing/versioning).
export const LINKEDIN_ADS_API_VERSION = '202610';
export const LINKEDIN_ADS_REQUEST_HEADERS = {
    'Linkedin-Version': LINKEDIN_ADS_API_VERSION,
    'X-Restli-Protocol-Version': '2.0.0',
};
export const LINKEDIN_ADS_ANALYTICS_PATH = '/rest/adAnalytics';

export const getLinkedInAdsAccountPath = (adAccountId: string) =>
    `/rest/adAccounts/${adAccountId}`;

/**
 * adAnalytics reports IDs only. Names, statuses and types would need an
 * account-wide lookup on every query, so the explore has none.
 */
export const LINKEDIN_ADS_CAMPAIGN_COLUMNS = ['campaign.id'] as const;

export const LINKEDIN_ADS_CAMPAIGN_GROUP_COLUMNS = [
    'campaignGroup.id',
] as const;

export const LINKEDIN_ADS_DATE_COLUMNS = ['day', 'month', 'year'] as const;

// adAnalytics takes 20 fields, and every query spends two on dateRange and
// pivotValues (https://learn.microsoft.com/linkedin/marketing/integrations/ads-reporting/ads-reporting)
export const LINKEDIN_ADS_MAX_METRICS = 18;

/** Days a query reads without a date filter. */
export const LINKEDIN_ADS_DEFAULT_DAYS = 28;

const errorSchema = z.object({ message: z.string().optional() });

/** Turns a LinkedIn API error response into an error that says what to change. */
export const toLinkedInApiError = (
    response: LiveHttpResponse,
    adAccountId: string,
): Error => {
    const parsed = errorSchema.safeParse(response.body);
    const detail =
        parsed.success && parsed.data.message ? `: ${parsed.data.message}` : '';
    switch (response.status) {
        case 400:
            return new WarehouseQueryError(
                `LinkedIn Ads rejected the request${detail}`,
            );
        case 401:
            return new WarehouseConnectionError(
                `LinkedIn sign-in has expired${detail}. Reconnect the source.`,
            );
        case 403:
            return new WarehouseConnectionError(
                `LinkedIn denied access to ad account ${adAccountId}${detail}. Check that the signed-in member still has a role on the account, or reconnect the source.`,
            );
        case 404:
            return new WarehouseConnectionError(
                `LinkedIn could not find ad account ${adAccountId}${detail}`,
            );
        case 429:
            return new TooManyRequestsError(
                `LinkedIn Ads rate limit reached${detail}. Retry in a few minutes.`,
                { retryAfterSeconds: null },
            );
        default:
            return new UnexpectedServerError(
                `LinkedIn Ads returned ${response.status}${detail}`,
            );
    }
};
