import { TooManyRequestsError, UnexpectedServerError } from '@lightdash/common';
import { z } from 'zod';
import { toLiveHttpError, type LiveHttpResponse } from '../../sdk';

const googleErrorSchema = z.object({
    error: z.object({
        message: z.string().optional(),
        status: z.string().optional(),
    }),
});

/** Turns a Google API error response into an error that says what to change. */
export const toGoogleApiError = (
    response: LiveHttpResponse,
    { label, resource }: { label: string; resource: string },
): Error => {
    const parsed = googleErrorSchema.safeParse(response.body);
    const message = parsed.success ? parsed.data.error.message : undefined;
    const detail = message ? `: ${message}` : '';
    const quotaExceeded = (retryAfterSeconds: number | null) =>
        `${label} quota exceeded${detail}. ${
            retryAfterSeconds !== null
                ? `Retry after ${retryAfterSeconds} seconds.`
                : 'Retry in a minute.'
        }`;
    const denied = `Google denied access to ${resource}${detail}. Check that the signed-in Google account can still read it, or reconnect the source.`;
    const connection = {
        401: denied,
        403: denied,
        404: `${label} could not find ${resource}${detail}`,
    };
    const failed = `${label} returned ${response.status}${detail}`;
    const { status } = response;
    // Google reports some quota errors as 401 or 403
    if (
        (status === 401 || status === 403) &&
        parsed.success &&
        parsed.data.error.status === 'RESOURCE_EXHAUSTED'
    ) {
        return new TooManyRequestsError(quotaExceeded(null), {
            retryAfterSeconds: null,
        });
    }
    // Only a 400 is the request's fault; other unlisted 4xx are Google's
    if (
        status > 400 &&
        status < 500 &&
        status !== 429 &&
        !(status in connection)
    ) {
        return new UnexpectedServerError(failed);
    }
    return toLiveHttpError(response, {
        rateLimited: quotaExceeded,
        connection,
        rejected: `${label} rejected the request${detail}`,
        failed,
    });
};
