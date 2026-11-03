import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useResolvedColorScheme } from './useResolvedColorScheme';

describe('useResolvedColorScheme', () => {
    const originalMatchMedia = window.matchMedia;

    afterEach(() => {
        window.matchMedia = originalMatchMedia;
    });

    it('falls back to light for system when the host has no matchMedia', () => {
        // @ts-expect-error plain jsdom hosts do not implement matchMedia
        delete window.matchMedia;

        expect(
            renderHook(() => useResolvedColorScheme('system')).result.current,
        ).toBe('light');
        expect(
            renderHook(() => useResolvedColorScheme('dark')).result.current,
        ).toBe('dark');
    });
});
