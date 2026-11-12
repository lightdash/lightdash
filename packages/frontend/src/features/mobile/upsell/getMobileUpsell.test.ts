import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
    window.history.replaceState({}, '', '/');
    vi.resetModules();
});

describe('mobile upsell query', () => {
    it('keeps the page-load choice after the home redirect removes the query', async () => {
        window.history.replaceState({}, '', '/?mobileUpsell=2');
        vi.resetModules();
        const { getMobileUpsell } = await import('./getMobileUpsell');
        window.history.replaceState({}, '', '/projects/test/home');
        expect(getMobileUpsell()).toBe(2);
        window.history.replaceState(
            {},
            '',
            '/projects/test/home?mobileUpsell=invalid',
        );
        expect(getMobileUpsell()).toBeNull();
        window.history.replaceState(
            {},
            '',
            '/projects/test/home?mobileUpsell=6',
        );
        expect(getMobileUpsell()).toBe(6);
    });
});
