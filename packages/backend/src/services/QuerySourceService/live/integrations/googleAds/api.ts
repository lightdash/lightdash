import { z } from 'zod';
import { type LiveHttpResponse } from '../../sdk';
import { toGoogleApiError } from '../google/errors';

export const GOOGLE_ADS_ORIGIN = 'https://googleads.googleapis.com';
// Each version is sunset about a year after release; v26 runs to November 2027
// (https://developers.google.com/google-ads/api/docs/sunset-dates).
export const GOOGLE_ADS_API_VERSION = 'v26';
export const GOOGLE_ADS_LIST_CUSTOMERS_PATH = `/${GOOGLE_ADS_API_VERSION}/customers:listAccessibleCustomers`;

export const getGoogleAdsSearchPath = (customerId: string) =>
    `/${GOOGLE_ADS_API_VERSION}/customers/${customerId}/googleAds:search`;

/** Money fields GAQL reports in millionths of the account currency. */
export const GOOGLE_ADS_MICROS_FIELDS: ReadonlySet<string> = new Set([
    'metrics.cost_micros',
    'metrics.average_cpc',
    'metrics.average_cpm',
    'metrics.cost_per_conversion',
]);

const googleAdsFailureSchema = z.object({
    error: z.object({
        message: z.string().optional(),
        status: z.string().optional(),
        details: z
            .array(
                z.object({
                    errors: z
                        .array(z.object({ message: z.string().optional() }))
                        .optional(),
                }),
            )
            .optional(),
    }),
});

/**
 * Google's top-level message is often just "invalid argument"; the reason
 * is in the GoogleAdsFailure details.
 */
export const toGoogleAdsApiError = (
    response: LiveHttpResponse,
    resource: string,
): Error => {
    const parsed = googleAdsFailureSchema.safeParse(response.body);
    if (!parsed.success) {
        return toGoogleApiError(response, { label: 'Google Ads', resource });
    }
    const { error } = parsed.data;
    const reasons = (error.details ?? [])
        .flatMap(({ errors }) => errors ?? [])
        .flatMap(({ message }) => message ?? []);
    return toGoogleApiError(
        {
            ...response,
            body: {
                error: {
                    status: error.status,
                    message:
                        reasons.length > 0 ? reasons.join(' ') : error.message,
                },
            },
        },
        { label: 'Google Ads', resource },
    );
};
