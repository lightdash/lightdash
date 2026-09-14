import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../utils/navigation', () => ({
    navigateTo: vi.fn(),
}));

import { navigateTo } from '../utils/navigation';
import { useMobileSetupAutoOpen } from './useMobileSetupAutoOpen';

const navigated = vi.mocked(navigateTo);

const SCHEME_URL = 'com.lightdash.mobile://setup?v=1&i=http%3A%2F%2Fx&c=CODE';
const STORE_URL = 'https://play.google.com/store/apps/details?id=x';

const setHidden = (hidden: boolean) => {
    Object.defineProperty(document, 'hidden', {
        value: hidden,
        configurable: true,
    });
};

beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    setHidden(false);
});

afterEach(() => {
    vi.useRealTimers();
});

describe('useMobileSetupAutoOpen', () => {
    it('attempts the app immediately, then falls through to the store', () => {
        renderHook(() =>
            useMobileSetupAutoOpen({
                schemeUrl: SCHEME_URL,
                storeUrl: STORE_URL,
                enabled: true,
            }),
        );

        expect(navigated).toHaveBeenCalledWith(SCHEME_URL);
        expect(navigated).toHaveBeenCalledTimes(1);

        vi.advanceTimersByTime(2000);

        expect(navigated).toHaveBeenCalledWith(STORE_URL);
    });

    it('does not send a backgrounded page to the store', () => {
        renderHook(() =>
            useMobileSetupAutoOpen({
                schemeUrl: SCHEME_URL,
                storeUrl: STORE_URL,
                enabled: true,
            }),
        );

        setHidden(true);
        vi.advanceTimersByTime(2000);

        expect(navigated).toHaveBeenCalledTimes(1);
        expect(navigated).not.toHaveBeenCalledWith(STORE_URL);
    });

    it('does nothing on desktop or an unplaced user agent', () => {
        renderHook(() =>
            useMobileSetupAutoOpen({
                schemeUrl: SCHEME_URL,
                storeUrl: STORE_URL,
                enabled: false,
            }),
        );

        vi.advanceTimersByTime(2000);

        expect(navigated).not.toHaveBeenCalled();
    });

    it('still tries the app when the platform has no store listing yet', () => {
        renderHook(() =>
            useMobileSetupAutoOpen({
                schemeUrl: SCHEME_URL,
                storeUrl: null,
                enabled: true,
            }),
        );

        vi.advanceTimersByTime(2000);

        expect(navigated).toHaveBeenCalledTimes(1);
        expect(navigated).toHaveBeenCalledWith(SCHEME_URL);
    });

    it('asks for the app once, even when the store URL arrives later', () => {
        const { rerender } = renderHook(
            (props: { storeUrl: string | null }) =>
                useMobileSetupAutoOpen({
                    schemeUrl: SCHEME_URL,
                    storeUrl: props.storeUrl,
                    enabled: true,
                }),
            { initialProps: { storeUrl: null as string | null } },
        );

        expect(navigated).toHaveBeenCalledTimes(1);

        // health resolves, so the store URL appears and the effect re-runs
        rerender({ storeUrl: STORE_URL });

        expect(navigated).toHaveBeenCalledTimes(1);
        expect(navigated).toHaveBeenCalledWith(SCHEME_URL);

        vi.advanceTimersByTime(2000);

        expect(navigated).toHaveBeenCalledWith(STORE_URL);
        expect(navigated).toHaveBeenCalledTimes(2);
    });

    it('drops the pending store redirect when the page unmounts', () => {
        const { unmount } = renderHook(() =>
            useMobileSetupAutoOpen({
                schemeUrl: SCHEME_URL,
                storeUrl: STORE_URL,
                enabled: true,
            }),
        );

        unmount();
        vi.advanceTimersByTime(2000);

        expect(navigated).toHaveBeenCalledTimes(1);
    });
});
