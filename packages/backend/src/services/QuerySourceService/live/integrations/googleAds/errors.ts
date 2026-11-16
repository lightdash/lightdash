import { z } from 'zod';
import { type LiveHttpResponse } from '../../types';
import { toGoogleApiError } from '../google/errors';

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
