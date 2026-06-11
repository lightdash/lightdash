/**
 * Parses the embed `?timezone=` URL param (IANA string) from the current URL
 * query string, parsed once on mount alongside the theme params. An empty or
 * whitespace-only value is treated as absent (null) so a malformed templated
 * URL falls through to the chart pin / project default instead of erroring; a
 * non-empty value is sent as-is and the backend validates it.
 */
export function parseEmbedTimezoneParam(): string | null {
    const params = new URLSearchParams(window.location.search);
    const timezone = params.get('timezone')?.trim();
    return timezone ? timezone : null;
}
