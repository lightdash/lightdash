import { describe, expect, it } from 'vitest';
import { isChunkLoadError } from './chunkErrorHandler';

describe('chunkErrorHandler', () => {
    it('detects dynamic import and preload failures', () => {
        expect(
            isChunkLoadError(
                'TypeError: Failed to fetch dynamically imported module',
            ),
        ).toBe(true);
        expect(
            isChunkLoadError(
                'TypeError: error loading dynamically imported module',
            ),
        ).toBe(true);
        expect(isChunkLoadError('Importing a module script failed.')).toBe(
            true,
        );
        expect(
            isChunkLoadError('Unable to preload CSS for /assets/app.css'),
        ).toBe(true);
    });

    it('does not match unrelated errors', () => {
        expect(isChunkLoadError('Network request failed')).toBe(false);
        expect(isChunkLoadError('Something went wrong')).toBe(false);
    });
});
