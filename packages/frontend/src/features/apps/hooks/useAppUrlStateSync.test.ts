import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppUrlStateSync } from './useAppUrlStateSync';

const BASE_URL =
    'https://preview.example/api/apps/a/versions/1/t/tok/#transport=postMessage&projectUuid=p';
const APP_A = 'app-aaaa';
const APP_B = 'app-bbbb';

const setPageUrl = (search: string) => {
    window.history.replaceState(null, '', `/view${search}`);
};

const currentStateParam = () =>
    new URLSearchParams(window.location.search).get('state');

function render(appUuid: string = APP_A) {
    return renderHook(
        (props: { appUuid: string }) =>
            useAppUrlStateSync({ appUuid: props.appUuid, enabled: true }),
        { initialProps: { appUuid } },
    );
}

describe('useAppUrlStateSync', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        setPageUrl('');
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('seeds applySeed from a valid ?state= param', () => {
        const encoded = JSON.stringify({ period: 'ytd' });
        setPageUrl(`?state=${encodeURIComponent(encoded)}`);
        const { result } = render();
        expect(result.current.applySeed(BASE_URL)).toBe(
            `${BASE_URL}&state=${encodeURIComponent(encoded)}`,
        );
    });

    it('ignores garbage, non-object, and oversized seeds', () => {
        for (const raw of [
            'not-json',
            '[1,2]',
            '42',
            JSON.stringify({ big: 'x'.repeat(5000) }),
        ]) {
            setPageUrl(`?state=${encodeURIComponent(raw)}`);
            const { result, unmount } = render();
            expect(result.current.applySeed(BASE_URL)).toBe(BASE_URL);
            unmount();
        }
    });

    it('updates applySeed immediately on a state change, before the URL write fires', () => {
        const { result } = render();
        act(() => {
            result.current.handleUrlStateChange({ period: 'last_7_days' });
        });
        // No timer advance: a reload right after the change must still seed it.
        expect(result.current.applySeed(BASE_URL)).toBe(
            `${BASE_URL}&state=${encodeURIComponent(
                JSON.stringify({ period: 'last_7_days' }),
            )}`,
        );
        expect(currentStateParam()).toBeNull();
    });

    it('debounces the URL write and keeps only the latest state', () => {
        const { result } = render();
        act(() => {
            result.current.handleUrlStateChange({ period: 'ytd' });
            result.current.handleUrlStateChange({ period: 'last_7_days' });
        });
        expect(currentStateParam()).toBeNull();
        act(() => {
            vi.advanceTimersByTime(300);
        });
        expect(currentStateParam()).toBe(
            JSON.stringify({ period: 'last_7_days' }),
        );
    });

    it('removes the ?state= param when the app reports an empty map', () => {
        setPageUrl(`?state=${encodeURIComponent('{"period":"ytd"}')}`);
        const { result } = render();
        act(() => {
            result.current.handleUrlStateChange({});
            vi.advanceTimersByTime(300);
        });
        expect(currentStateParam()).toBeNull();
        expect(result.current.applySeed(BASE_URL)).toBe(BASE_URL);
    });

    it('drops the previous app state and clears the URL on app switch', () => {
        setPageUrl(`?state=${encodeURIComponent('{"period":"ytd"}')}`);
        const { result, rerender } = render(APP_A);
        expect(result.current.applySeed(BASE_URL)).not.toBe(BASE_URL);

        rerender({ appUuid: APP_B });
        expect(result.current.applySeed(BASE_URL)).toBe(BASE_URL);
        expect(currentStateParam()).toBeNull();
    });

    it('cancels a pending URL write on unmount', () => {
        const { result, unmount } = render();
        act(() => {
            result.current.handleUrlStateChange({ period: 'ytd' });
        });
        unmount();
        act(() => {
            vi.advanceTimersByTime(300);
        });
        expect(currentStateParam()).toBeNull();
    });
});
