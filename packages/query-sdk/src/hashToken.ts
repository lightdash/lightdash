/**
 * Extract the JWT token from a URL hash fragment.
 *
 * The parent frame sets the iframe src to:
 *   https://preview.lightdash.app/preview/{versionId}#token={jwt}
 *
 * Hash fragments are never sent to the server, so the token
 * doesn't leak into server logs, CDN logs, or Referer headers.
 */
export function extractHashToken(hash: string): string | null {
    if (!hash || hash === '#') return null;

    const params = new URLSearchParams(hash.replace(/^#/, ''));
    const token = params.get('token');
    return token || null;
}

/**
 * Read the token from the current window's hash fragment.
 * Returns null if not in a browser or no token present.
 */
export function getTokenFromHash(): string | null {
    if (typeof window === 'undefined') return null;
    return extractHashToken(window.location.hash);
}
