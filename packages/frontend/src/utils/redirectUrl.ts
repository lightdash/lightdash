/**
 * The single same-origin guard for navigation targets. A value is safe only if
 * it is a root-relative path: absolute URLs, protocol-relative (`//host`) and
 * backslash variants (`/\host`) all leave this origin and are not.
 *
 * Redirect sanitisation and internal-link resolution both funnel through this,
 * so hardening it — a newly found bypass form, say — covers both call sites.
 */
export const isRootRelativePath = (
    url: string | null | undefined,
): url is string =>
    !!url &&
    url.startsWith('/') &&
    !url.startsWith('//') &&
    !url.startsWith('/\\');

/**
 * Post-login redirect targets come from the URL (`?redirect=`) or router state
 * and must stay on this origin. Anything that isn't a root-relative path —
 * absolute URLs, protocol-relative (`//host`), or backslash variants (`/\host`)
 * — falls back to `/`.
 */
export const sanitizeRedirectUrl = (url: string | null | undefined): string =>
    isRootRelativePath(url) ? url : '/';
