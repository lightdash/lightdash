import { type AppColorScheme } from '@lightdash/common';

// Matches COLOR_SCHEME_PARAM in packages/query-sdk/src/colorScheme.ts.
const COLOR_SCHEME_PARAM = 'theme';

/**
 * Seed an app preview URL's hash with the host's resolved color scheme, so the
 * SDK can apply it as the app boots rather than waiting for the first bridge
 * message. The hash is used (not the query string) because it isn't sent to the
 * preview server and so never varies the cached response.
 */
export const withColorSchemeParam = (
    url: string,
    colorScheme: AppColorScheme,
): string => {
    const hashIndex = url.indexOf('#');
    const base = hashIndex === -1 ? url : url.slice(0, hashIndex);
    const params = new URLSearchParams(
        hashIndex === -1 ? '' : url.slice(hashIndex + 1),
    );
    params.set(COLOR_SCHEME_PARAM, colorScheme);
    return `${base}#${params.toString()}`;
};
