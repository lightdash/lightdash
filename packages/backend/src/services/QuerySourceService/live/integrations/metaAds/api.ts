import {
    TooManyRequestsError,
    UnexpectedServerError,
    WarehouseConnectionError,
    WarehouseQueryError,
} from '@lightdash/common';
import { z } from 'zod';
import { type LiveHttpResponse } from '../../sdk';

export type MetaAdsLevel = 'account' | 'campaign' | 'adset' | 'ad';

/** Coarsest first; a query reads at the finest level it groups by. */
export const META_ADS_LEVELS: readonly MetaAdsLevel[] = [
    'account',
    'campaign',
    'adset',
    'ad',
];

/** Which reporting level each ad object field needs. */
export const META_ADS_FIELD_LEVELS: Record<string, MetaAdsLevel> = {
    campaign_id: 'campaign',
    campaign_name: 'campaign',
    objective: 'campaign',
    adset_id: 'adset',
    adset_name: 'adset',
    ad_id: 'ad',
    ad_name: 'ad',
};

/** The Insights `filtering` field of each filterable ad object field. */
export const META_ADS_FILTER_FIELDS: Record<string, string> = {
    campaign_id: 'campaign.id',
    campaign_name: 'campaign.name',
    adset_id: 'adset.id',
    adset_name: 'adset.name',
    ad_id: 'ad.id',
    ad_name: 'ad.name',
};

/**
 * Values Meta reports per breakdown; the ones not listed in its combining
 * table (https://developers.facebook.com/docs/marketing-api/insights/breakdowns),
 * or that need an ad account opt-in such as `impression_device`, are left out.
 */
export const META_ADS_BREAKDOWNS = [
    'age',
    'gender',
    'country',
    'publisher_platform',
    'platform_position',
] as const;

/** Days a query reads without a date filter. */
export const META_ADS_DEFAULT_DAYS = 30;

const errorSchema = z.object({
    error: z.object({
        message: z.string().optional(),
        code: z.number().optional(),
        error_subcode: z.number().optional(),
    }),
});

const META_THROTTLE_CODES = new Set([4, 17, 613]);
const isMetaThrottle = (code: number | undefined) =>
    code !== undefined &&
    (META_THROTTLE_CODES.has(code) || (code >= 80000 && code <= 80014));
const META_TOO_MUCH_DATA_SUBCODE = 1487534;

/** Turns an Insights error response into an error that says what to change. */
export const toMetaAdsError = (
    response: LiveHttpResponse,
    adAccountId: string,
): Error => {
    const parsed = errorSchema.safeParse(response.body);
    const {
        message,
        code,
        error_subcode: subcode,
    } = parsed.success
        ? parsed.data.error
        : { message: undefined, code: undefined, error_subcode: undefined };
    const detail = message ? `: ${message}` : '';
    if (code === 190) {
        return new WarehouseConnectionError(
            `Meta rejected the access token${detail}. Generate a new system user token with ads_read and update this live data source.`,
        );
    }
    if (code === 200 || code === 10 || response.status === 403) {
        return new WarehouseConnectionError(
            `Meta denied access to ad account ${adAccountId}${detail}. Check that the token has ads_read and its system user is assigned to this ad account.`,
        );
    }
    if (isMetaThrottle(code) || response.status === 429) {
        return new TooManyRequestsError(
            `Meta Ads rate limit reached${detail}. Retry in a few minutes.`,
            { retryAfterSeconds: null },
        );
    }
    if (
        subcode === META_TOO_MUCH_DATA_SUBCODE ||
        code === 1 ||
        response.status === 504
    ) {
        return new WarehouseQueryError(
            `Meta Ads can't return this much data at once${detail}. Narrow the date range or remove a dimension.`,
        );
    }
    if (code === 3018) {
        return new WarehouseQueryError(
            `Meta Ads keeps 37 months of history${detail}. Choose a more recent date range.`,
        );
    }
    if (response.status >= 400 && response.status < 500) {
        return new WarehouseQueryError(
            `Meta Ads rejected the request${detail}`,
        );
    }
    return new UnexpectedServerError(
        `Meta Ads returned ${response.status}${detail}`,
    );
};
