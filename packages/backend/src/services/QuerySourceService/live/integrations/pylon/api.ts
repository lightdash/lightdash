import { z } from 'zod';
import { toLiveHttpError, type LiveHttpResponse } from '../../sdk';

const errorSchema = z.object({
    message: z.string().optional(),
    errors: z
        .array(z.union([z.string(), z.object({ message: z.string() })]))
        .optional(),
});

const readMessage = (body: unknown) => {
    const parsed = errorSchema.safeParse(body);
    if (!parsed.success) {
        return typeof body === 'string' ? body.slice(0, 300) : '';
    }
    return (
        [
            parsed.data.message,
            ...(parsed.data.errors ?? []).map((error) =>
                typeof error === 'string' ? error : error.message,
            ),
        ]
            .filter(Boolean)
            .join(': ')
            // Our sentence goes on after it
            .replace(/[.!\s]+$/, '')
    );
};

/** Turns a Pylon error response into an error that says what to change. */
export const toPylonError = (response: LiveHttpResponse): Error => {
    const message = readMessage(response.body);
    const detail = message ? `: ${message}` : '';
    return toLiveHttpError(response, {
        rateLimited: (retryAfterSeconds) =>
            `Pylon rate limit reached${detail}. Search allows about 120 calls a minute per workspace; retry ${
                retryAfterSeconds
                    ? `in ${retryAfterSeconds} seconds`
                    : 'shortly'
            }.`,
        connection: {
            401: `Pylon rejected the API token${detail}. Ask a Pylon admin for a new token and update this live data source.`,
            403: `The Pylon API token can't read this${detail}. Pylon API tokens are created by admins in Settings, API Tokens.`,
        },
        rejected: `Pylon couldn't run this search${detail}. Check the filter values.`,
        failed: `Pylon returned ${response.status}${detail}`,
    });
};
