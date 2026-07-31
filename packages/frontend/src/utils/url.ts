/**
 * Resolve a configured URL to a client-routable path, or null when it points at
 * another origin. Lets same-origin targets navigate through react-router while
 * absolute external ones (e.g. a cloud `signupUrl`) stay real document links.
 */
export const resolveInternalPath = (url: string): string | null => {
    try {
        const resolved = new URL(url, window.location.origin);
        return resolved.origin === window.location.origin
            ? `${resolved.pathname}${resolved.search}${resolved.hash}`
            : null;
    } catch {
        return null;
    }
};
