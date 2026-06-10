/**
 * Read a cookie value by name. Returns null when not present or when running
 * outside a browser context. The value is returned raw (still URL-encoded) —
 * pass it straight to the matching decoder (e.g. `decodeLastLoginMethodCookie`).
 */
export const getCookie = (name: string): string | null => {
    if (typeof document === 'undefined') return null;
    const match = document.cookie
        .split('; ')
        .find((row) => row.startsWith(`${name}=`));
    return match ? match.slice(name.length + 1) : null;
};

/**
 * Write a cookie. The value is stored verbatim — pre-encode it (e.g. with
 * `encodeLastLoginMethodCookie`) so it round-trips through `getCookie`. `Secure`
 * is only set over HTTPS so the cookie still persists in local http dev.
 */
export const setCookie = (
    name: string,
    value: string,
    maxAgeSeconds: number,
): void => {
    if (typeof document === 'undefined') return;
    const secure = window.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `${name}=${value}; Path=/; Max-Age=${maxAgeSeconds}; SameSite=Lax${secure}`;
};
