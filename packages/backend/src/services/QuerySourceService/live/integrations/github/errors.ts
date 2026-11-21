import {
    TooManyRequestsError,
    UnexpectedServerError,
    WarehouseConnectionError,
    WarehouseQueryError,
} from '@lightdash/common';
import { z } from 'zod';
import { type LiveHttpResponse } from '../../types';

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
    if (isRateLimited(response, message)) {
        const retryAfterSeconds = getRetryAfterSeconds(response.headers, now);
        return new TooManyRequestsError(
            `GitHub rate limit reached${detail}. GitHub allows 5,000 calls an hour per token, and search about 30 a minute; retry ${
                retryAfterSeconds
                    ? `in ${retryAfterSeconds} seconds`
                    : 'shortly'
            }.`,
            { retryAfterSeconds },
        );
    }
    if (response.status === 401) {
        return new WarehouseConnectionError(
            `GitHub rejected the token${detail}. Create a new personal access token and update this live data source.`,
        );
    }
    if (response.status === 403 || response.status === 404) {
        return new WarehouseConnectionError(
            `GitHub can't read ${owner}/${repo}${detail}. Check the repository name and that the token can read it (for a fine-grained token: Metadata, Issues and Pull requests read access).`,
        );
    }
    if (response.status === 422) {
        return new WarehouseQueryError(
            `GitHub couldn't run this search${detail}. Check the filter values.`,
        );
    }
    if (response.status >= 400 && response.status < 500) {
        return new WarehouseQueryError(`GitHub rejected the request${detail}`);
    }
    return new UnexpectedServerError(
        `GitHub returned ${response.status}${detail}`,
    );
};
