import { describe, expect, it } from 'vitest';
import { shouldShowContentAsCodeSync } from './types';

describe('shouldShowContentAsCodeSync', () => {
    it('hides the nav until the status query resolves', () => {
        expect(shouldShowContentAsCodeSync(undefined)).toBe(false);
    });

    it('shows the nav when the API is not deployed yet', () => {
        expect(shouldShowContentAsCodeSync({ kind: 'unavailable' })).toBe(true);
    });

    it('hides the nav when the project has not enabled sync', () => {
        expect(
            shouldShowContentAsCodeSync({
                kind: 'ok',
                status: {
                    syncEnabled: false,
                    lastAppliedAt: null,
                    items: [],
                },
            }),
        ).toBe(false);
    });

    it('shows the nav when sync is enabled', () => {
        expect(
            shouldShowContentAsCodeSync({
                kind: 'ok',
                status: {
                    syncEnabled: true,
                    lastAppliedAt: null,
                    items: [],
                },
            }),
        ).toBe(true);
    });
});
