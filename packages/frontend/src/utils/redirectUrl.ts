/**
 * Post-login redirect targets come from the URL (`?redirect=`) or router state
 * and must stay on this origin. Anything that isn't a root-relative path —
 * absolute URLs, protocol-relative (`//host`), or backslash variants (`/\host`)
 * — falls back to `/`.
 */
export const sanitizeRedirectUrl = (url: string | null | undefined): string =>
    url &&
    url.startsWith('/') &&
    !url.startsWith('//') &&
    !url.startsWith('/\\')
        ? url
        : '/';
