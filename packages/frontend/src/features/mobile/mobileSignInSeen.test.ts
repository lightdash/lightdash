import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    hasOpenedMobileSignIn,
    MOBILE_SIGN_IN_SEEN_KEY,
    rememberMobileSignInOpened,
    useMobileSignInSeen,
} from './mobileSignInSeen';

const blockStorage = (method: 'getItem' | 'setItem', name: string) =>
    vi.spyOn(Storage.prototype, method).mockImplementation(() => {
        throw new DOMException('blocked', name);
    });

beforeEach(() => {
    window.localStorage.clear();
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('mobileSignInSeen', () => {
    it('reports not opened and shows the dot on empty storage', () => {
        expect(hasOpenedMobileSignIn()).toBe(false);
        const { result } = renderHook(() => useMobileSignInSeen());
        expect(result.current.seen).toBe(false);
    });

    it('marks the popover seen and persists it', () => {
        const { result } = renderHook(() => useMobileSignInSeen());

        act(() => result.current.markSeen());

        expect(result.current.seen).toBe(true);
        expect(window.localStorage.getItem(MOBILE_SIGN_IN_SEEN_KEY)).toBe(
            'true',
        );
        expect(hasOpenedMobileSignIn()).toBe(true);
    });

    it('stays seen after a remount', () => {
        const first = renderHook(() => useMobileSignInSeen());
        act(() => first.result.current.markSeen());
        first.unmount();

        const second = renderHook(() => useMobileSignInSeen());

        expect(second.result.current.seen).toBe(true);
    });

    it('updates every mounted instance when one marks it seen', () => {
        const first = renderHook(() => useMobileSignInSeen());
        const second = renderHook(() => useMobileSignInSeen());

        act(() => first.result.current.markSeen());

        expect(second.result.current.seen).toBe(true);
    });

    it('shows the dot and does not throw when storage reads fail', () => {
        window.localStorage.setItem(MOBILE_SIGN_IN_SEEN_KEY, 'true');
        blockStorage('getItem', 'SecurityError');

        expect(() => hasOpenedMobileSignIn()).not.toThrow();
        expect(hasOpenedMobileSignIn()).toBe(false);
        const { result } = renderHook(() => useMobileSignInSeen());
        expect(result.current.seen).toBe(false);
    });

    it('hides the dot for the session and does not throw when storage writes fail', () => {
        blockStorage('setItem', 'QuotaExceededError');
        const { result } = renderHook(() => useMobileSignInSeen());

        expect(rememberMobileSignInOpened()).toBe(false);
        expect(() => act(() => result.current.markSeen())).not.toThrow();

        expect(result.current.seen).toBe(true);
        expect(window.localStorage.getItem(MOBILE_SIGN_IN_SEEN_KEY)).toBeNull();
    });

    it('follows a change made in another tab', () => {
        const { result } = renderHook(() => useMobileSignInSeen());

        act(() => {
            window.localStorage.setItem(MOBILE_SIGN_IN_SEEN_KEY, 'true');
            window.dispatchEvent(
                new StorageEvent('storage', { key: MOBILE_SIGN_IN_SEEN_KEY }),
            );
        });

        expect(result.current.seen).toBe(true);
    });
});
