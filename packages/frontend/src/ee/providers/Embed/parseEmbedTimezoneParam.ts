/**
 * Parses the embed `?timezone=` URL param (IANA string) from the current URL
 * query string, parsed once on mount alongside the theme params. The raw value
 * is sent as-is; the backend validates and hard-errors on an invalid zone.
 */
export function parseEmbedTimezoneParam(): string | null {
    const params = new URLSearchParams(window.location.search);
    return params.get('timezone');
}
