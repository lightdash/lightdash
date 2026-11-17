import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    hasDismissedMobilePitch,
    MOBILE_PITCH_DISMISSED_KEY,
    rememberMobilePitchDismissed,
    useMobilePitchDismissed,
} from './mobilePitchDismissed';

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

describe('mobilePitchDismissed', () => {
    it('starts not dismissed on empty storage', () => {
        expect(hasDismissedMobilePitch()).toBe(false);
        const { result } = renderHook(() => useMobilePitchDismissed());
        expect(result.current.dismissed).toBe(false);
    });

    it('persists the dismissal and keeps it after a remount', () => {
        const first = renderHook(() => useMobilePitchDismissed());

        act(() => first.result.current.dismiss());

        expect(first.result.current.dismissed).toBe(true);
        expect(window.localStorage.getItem(MOBILE_PITCH_DISMISSED_KEY)).toBe(
            'true',
        );
        first.unmount();
        const second = renderHook(() => useMobilePitchDismissed());
        expect(second.result.current.dismissed).toBe(true);
    });

    it('updates every mounted instance when one dismisses', () => {
        const first = renderHook(() => useMobilePitchDismissed());
        const second = renderHook(() => useMobilePitchDismissed());

        act(() => first.result.current.dismiss());

        expect(second.result.current.dismissed).toBe(true);
    });

    it('follows a dismissal made in another tab', () => {
        const { result } = renderHook(() => useMobilePitchDismissed());

        act(() => {
            window.localStorage.setItem(MOBILE_PITCH_DISMISSED_KEY, 'true');
            window.dispatchEvent(
                new StorageEvent('storage', {
                    key: MOBILE_PITCH_DISMISSED_KEY,
                }),
            );
        });

        expect(result.current.dismissed).toBe(true);
    });

    it('does not throw and shows the pitch when storage reads fail', () => {
        window.localStorage.setItem(MOBILE_PITCH_DISMISSED_KEY, 'true');
        blockStorage('getItem', 'SecurityError');

        expect(() => hasDismissedMobilePitch()).not.toThrow();
        const { result } = renderHook(() => useMobilePitchDismissed());
        expect(result.current.dismissed).toBe(false);
    });

    it('does not throw and hides the pitch for the session when storage writes fail', () => {
        blockStorage('setItem', 'QuotaExceededError');
        const { result } = renderHook(() => useMobilePitchDismissed());

        expect(rememberMobilePitchDismissed()).toBe(false);
        expect(() => act(() => result.current.dismiss())).not.toThrow();

        expect(result.current.dismissed).toBe(true);
        expect(
            window.localStorage.getItem(MOBILE_PITCH_DISMISSED_KEY),
        ).toBeNull();
    });
});
