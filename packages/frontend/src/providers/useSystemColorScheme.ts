import { useSyncExternalStore } from 'react';
import { type ColorScheme, type ColorSchemePreference } from '../theme';

const DARK_QUERY = '(prefers-color-scheme: dark)';

const subscribe = (onChange: () => void) => {
    if (typeof window === 'undefined' || !window.matchMedia) return () => {};
    const media = window.matchMedia(DARK_QUERY);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
};

const getSnapshot = (): ColorScheme =>
    typeof window !== 'undefined' && window.matchMedia?.(DARK_QUERY).matches
        ? 'dark'
        : 'light';

const getServerSnapshot = (): ColorScheme => 'light';

/** The OS colour scheme, re-rendering when the viewer switches it. */
const useSystemColorScheme = (): ColorScheme =>
    useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

/** Resolves a preference to the scheme to paint, following the OS for `system`. */
export const useResolvedColorScheme = (
    preference: ColorSchemePreference,
): ColorScheme => {
    const systemColorScheme = useSystemColorScheme();
    return preference === 'system' ? systemColorScheme : preference;
};

export const isColorSchemePreference = (
    value: unknown,
): value is ColorSchemePreference =>
    value === 'light' || value === 'dark' || value === 'system';
