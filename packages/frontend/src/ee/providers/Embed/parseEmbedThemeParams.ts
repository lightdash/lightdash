import { type EmbedTheme } from './types';

const HEX_COLOR_REGEX = /^[0-9a-fA-F]{3,8}$/;

/**
 * Parses the embed theme params from the current URL query string.
 * Used both at the app root (to force the color scheme without persisting it)
 * and inside the EmbedProvider (to expose them on the embed context).
 */
export function parseEmbedThemeParams(): {
    theme: EmbedTheme;
    backgroundColor: string | null;
} {
    const params = new URLSearchParams(window.location.search);
    const themeParam = params.get('theme');
    const theme: EmbedTheme =
        themeParam === 'light' || themeParam === 'dark' ? themeParam : 'light';
    const bgParam = params.get('backgroundColor');
    // Accept bare hex codes (e.g. "121212") and prepend "#"
    const backgroundColor =
        bgParam && HEX_COLOR_REGEX.test(bgParam) ? `#${bgParam}` : null;
    return { theme, backgroundColor };
}
