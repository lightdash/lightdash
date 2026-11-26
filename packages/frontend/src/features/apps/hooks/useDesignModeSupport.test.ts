import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    ANNOUNCE_GRACE_MS,
    useDesignModeSupport,
} from './useDesignModeSupport';

const render = (initial: {
    screenshotAvailable: boolean;
    inspectAtAvailable: boolean;
    bundleKey: string | null;
}) =>
    renderHook((props) => useDesignModeSupport(props), {
        initialProps: initial,
    });

describe('useDesignModeSupport', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('is ready once the app can picture itself and answer a pick', () => {
        const { result } = render({
            screenshotAvailable: true,
            inspectAtAvailable: true,
            bundleKey: 'a:1',
        });
        expect(result.current).toBe('ready');
    });

    it('waits for the app to announce before calling it too old', () => {
        const { result, rerender } = render({
            screenshotAvailable: false,
            inspectAtAvailable: false,
            bundleKey: 'a:1',
        });
        expect(result.current).toBe('checking');
        // The picture is announced first; the pick has its own time to follow.
        act(() => {
            vi.advanceTimersByTime(ANNOUNCE_GRACE_MS - 100);
        });
        rerender({
            screenshotAvailable: true,
            inspectAtAvailable: false,
            bundleKey: 'a:1',
        });
        act(() => {
            vi.advanceTimersByTime(ANNOUNCE_GRACE_MS - 100);
        });
        expect(result.current).toBe('checking');
        rerender({
            screenshotAvailable: true,
            inspectAtAvailable: true,
            bundleKey: 'a:1',
        });
        expect(result.current).toBe('ready');
    });

    it('needs updating when an app never says it can answer a pick', () => {
        const { result } = render({
            screenshotAvailable: true,
            inspectAtAvailable: false,
            bundleKey: 'a:1',
        });
        expect(result.current).toBe('checking');
        act(() => {
            vi.advanceTimersByTime(ANNOUNCE_GRACE_MS);
        });
        expect(result.current).toBe('needs-update');
    });

    it('gives a newly loaded version its own time to announce', () => {
        const { result, rerender } = render({
            screenshotAvailable: false,
            inspectAtAvailable: false,
            bundleKey: 'a:1',
        });
        act(() => {
            vi.advanceTimersByTime(ANNOUNCE_GRACE_MS);
        });
        expect(result.current).toBe('needs-update');
        rerender({
            screenshotAvailable: false,
            inspectAtAvailable: false,
            bundleKey: 'a:2',
        });
        expect(result.current).toBe('checking');
    });
});
