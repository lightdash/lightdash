import { useSyncExternalStore } from 'react';
import { type ColorScheme, type ColorSchemePreference } from '../theme';

const DARK_QUERY = '(prefers-color-scheme: dark)';

const subscribe = (onChange: () => void) => {
    const media = window.matchMedia(DARK_QUERY);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
};

const getSnapshot = (): ColorScheme =>
    window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light';

// Read synchronously (unlike @mantine/hooks useColorScheme) so the first
// render already paints the OS scheme instead of flashing the default.
export const useResolvedColorScheme = (
    preference: ColorSchemePreference,
): ColorScheme => {
    const systemColorScheme = useSyncExternalStore(subscribe, getSnapshot);
    return preference === 'system' ? systemColorScheme : preference;
};
