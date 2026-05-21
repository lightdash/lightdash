import { type ApiError } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { SERVER_ERROR_MARKER } from '../api';
import { getResultsFromStream } from './request';

describe('getResultsFromStream', () => {
    it('throws an ApiError stamped with SERVER_ERROR_MARKER when no URL is provided', async () => {
        // `await expect(...).rejects` guarantees we surface a clear
        // "expected to reject" failure if the function ever stops throwing,
        // instead of letting a try/catch swallow the unexpected resolve and
        // misreport it as a marker-missing failure.
        const promise = getResultsFromStream<unknown>(undefined);

        // Shape: must be a 5xx ApiError so the retry layer matches it.
        await expect(promise).rejects.toMatchObject<Partial<ApiError>>({
            status: 'error',
            error: {
                name: 'Error',
                statusCode: 500,
                message: 'No URL provided',
                data: {},
            },
        });

        // Provenance: the Symbol-keyed marker is invisible to `toMatchObject`,
        // so capture the rejection separately and assert on it explicitly.
        // Without the marker, the retry layer would treat this fabricated 5xx
        // as a non-retryable error.
        const caught = await promise.catch((e: unknown) => e);
        expect(typeof caught).toBe('object');
        expect(caught).not.toBeNull();
        expect(SERVER_ERROR_MARKER in (caught as object)).toBe(true);
    });
});
