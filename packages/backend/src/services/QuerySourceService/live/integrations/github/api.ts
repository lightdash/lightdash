import { TooManyRequestsError, WarehouseQueryError } from '@lightdash/common';
import { z } from 'zod';
import { toLiveHttpError, type LiveHttpResponse } from '../../sdk';

const errorSchema = z.object({
    message: z.string().optional(),
    errors: z.array(z.object({ message: z.string().optional() })).optional(),
});

/** Seconds until GitHub accepts calls again, from its rate limit headers. */
const getRetryAfterSeconds = (
    headers: Record<string, string>,
    now: Date,
): number | null => {
    const retryAfter = Number(headers['retry-after']);
    if (Number.isFinite(retryAfter) && retryAfter > 0) {
        return retryAfter;
    }
    const reset = Number(headers['x-ratelimit-reset']);
    if (Number.isFinite(reset) && reset > 0) {
        return Math.max(1, Math.ceil(reset - now.getTime() / 1000));
    }
    return null;
};

const isRateLimited = (response: LiveHttpResponse, message: string) =>
    response.status === 429 ||
    (response.status === 403 &&
        (response.headers['x-ratelimit-remaining'] === '0' ||
            /rate limit/i.test(message)));

/** Turns a GitHub error response into an error that says what to change. */
export const toGithubError = (
    response: LiveHttpResponse,
    { owner, repo }: { owner: string; repo: string },
    now = new Date(),
): Error => {
    const parsed = errorSchema.safeParse(response.body);
    const message = parsed.success
        ? [
              parsed.data.message,
              ...(parsed.data.errors ?? []).map((error) => error.message),
          ]
              .filter(Boolean)
              .join(': ')
        : '';
    const detail = message ? `: ${message}` : '';
    // GitHub's own message names the account's user ID or IP address
    const limit = /secondary rate limit/i.test(message)
        ? 'secondary rate limit'
        : 'rate limit';
    const rateLimited = (retryAfterSeconds: number | null) =>
        `GitHub ${limit} reached. Search allows about 30 queries a minute per token; retry ${
            retryAfterSeconds ? `in ${retryAfterSeconds} seconds` : 'shortly'
        }.`;
    // GitHub also limits with a 403, and says when with its own headers
    if (isRateLimited(response, message)) {
        const retryAfterSeconds = getRetryAfterSeconds(response.headers, now);
        return new TooManyRequestsError(rateLimited(retryAfterSeconds), {
            retryAfterSeconds,
        });
    }
    if (response.status === 422) {
        return new WarehouseQueryError(
            `GitHub couldn't run this search${detail}. Check the filter values.`,
        );
    }
    const unreadable = `GitHub can't read ${owner}/${repo}${detail}. Check the repository name and that the token can read it (for a fine-grained token: Metadata, Issues and Pull requests read access).`;
    return toLiveHttpError(response, {
        rateLimited,
        connection: {
            401: `GitHub rejected the token${detail}. Create a new personal access token and update this live data source.`,
            403: unreadable,
            404: unreadable,
        },
        rejected: `GitHub rejected the request${detail}`,
        failed: `GitHub returned ${response.status}${detail}`,
    });
};
