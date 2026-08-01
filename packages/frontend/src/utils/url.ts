import { isRootRelativePath } from './redirectUrl';

/**
 * Resolve a configured URL to a client-routable path, or null when it points at
 * another origin. Lets same-origin targets navigate through react-router while
 * absolute external ones (e.g. a cloud `signupUrl`) stay real document links.
 *
 * Unlike `sanitizeRedirectUrl` this accepts an absolute same-origin URL, because
 * configured links are usually written that way — it resolves one to its path
 * rather than rejecting it. The resulting path is then checked by the same
 * `isRootRelativePath` guard, so both share one definition of what is safe.
 */
export const resolveInternalPath = (url: string): string | null => {
    try {
        const resolved = new URL(url, window.location.origin);
        if (resolved.origin !== window.location.origin) return null;

        const path = `${resolved.pathname}${resolved.search}${resolved.hash}`;
        return isRootRelativePath(path) ? path : null;
    } catch {
        return null;
    }
};
