import { useSyncExternalStore } from 'react';
import { type ColorScheme, type ColorSchemePreference } from '../theme';

const DARK_QUERY = '(prefers-color-scheme: dark)';

// Plain jsdom hosts (SDK consumers' tests) and SSR have no matchMedia.
const canMatchMedia = () =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function';

const subscribe = (onChange: () => void) => {
    if (!canMatchMedia()) return () => {};
    const media = window.matchMedia(DARK_QUERY);
    // Older Safari and test stubs expose a MediaQueryList without event methods.
    if (typeof media.addEventListener !== 'function') return () => {};
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
};

const getSnapshot = (): ColorScheme =>
    canMatchMedia() && window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light';

const getServerSnapshot = (): ColorScheme => 'light';

// Read synchronously (unlike @mantine/hooks useColorScheme) so the first
// render already paints the OS scheme instead of flashing the default.
export const useResolvedColorScheme = (
    preference: ColorSchemePreference,
): ColorScheme => {
    const systemColorScheme = useSyncExternalStore(
        subscribe,
        getSnapshot,
        getServerSnapshot,
    );
    return preference === 'system' ? systemColorScheme : preference;
};
