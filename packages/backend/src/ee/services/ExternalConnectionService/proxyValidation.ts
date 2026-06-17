import { ParameterError } from '@lightdash/common';

// Reject anything that could escape the configured origin or smuggle a host.
// The decoded path must be a plain, host-free, relative path that prefix-matches
// one of the connection's allowlisted prefixes.
export function normalizeAndValidatePath(
    rawPath: string,
    allowedPathPrefixes: string[],
): string {
    if (typeof rawPath !== 'string' || rawPath.length === 0) {
        throw new ParameterError('path is required');
    }

    // Strip a query string if the caller jammed one onto the path — query
    // params are supplied separately and serialized server-side.
    const [pathOnly] = rawPath.split('?', 1);

    // Control characters (incl. NUL, CR, LF, tab) are never legal in a path.
    // eslint-disable-next-line no-control-regex
    if (/[\x00-\x1f\x7f]/.test(pathOnly)) {
        throw new ParameterError('path contains control characters');
    }

    // Backslashes are never legal and can be normalized to slashes by some
    // HTTP stacks, enabling traversal/host smuggling. Reject outright.
    if (pathOnly.includes('\\')) {
        throw new ParameterError('path must not contain backslashes');
    }

    // Must be a relative path beginning with exactly one slash. A leading
    // "//" is protocol-relative and resolves to an attacker host.
    if (!pathOnly.startsWith('/') || pathOnly.startsWith('//')) {
        throw new ParameterError(
            'path must be a relative path starting with /',
        );
    }

    // No scheme (absolute URL). Anything matching "scheme:" up front is rejected.
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(pathOnly)) {
        throw new ParameterError('path must not be an absolute URL');
    }

    // Decode percent-encoding so encoded traversal/host tricks are caught.
    // A malformed encoding (decodeURIComponent throws) is itself rejected.
    let decoded: string;
    try {
        decoded = decodeURIComponent(pathOnly);
    } catch {
        throw new ParameterError('path contains invalid percent-encoding');
    }

    // After decoding, re-run the host-smuggling checks on the decoded form.
    if (
        decoded.includes('\\') ||
        decoded.startsWith('//') ||
        /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(decoded)
    ) {
        throw new ParameterError('path resolves to a host or absolute URL');
    }

    // No userinfo/host markers. An '@' lets "/x@evil.com" be reinterpreted as
    // userinfo when concatenated into a URL string.
    if (decoded.includes('@')) {
        throw new ParameterError('path must not contain @');
    }

    // Path traversal in either raw or decoded form.
    const segments = decoded.split('/');
    if (segments.some((s) => s === '..')) {
        throw new ParameterError('path must not contain .. traversal');
    }

    // Prefix allowlist match against the decoded, host-free path.
    // Use segment-aware matching so /v1/users does not allow /v1/users-admin.
    const matches = allowedPathPrefixes.some((prefix) => {
        if (decoded === prefix) return true;
        const boundary = prefix.endsWith('/') ? prefix : `${prefix}/`;
        return decoded.startsWith(boundary);
    });
    if (!matches) {
        throw new ParameterError('path is not allowed by this connection');
    }

    // Return the decoded path; buildOutboundUrl re-encodes via the URL API.
    return decoded;
}

// Build the outbound URL entirely server-side. The host always comes from
// `origin`; the validated, host-free `path` is appended; query params are
// serialized with URLSearchParams. We never string-concat a user-supplied host.
export function buildOutboundUrl(
    origin: string,
    validatedPath: string,
    query: Record<string, string> | undefined,
): string {
    // Defense-in-depth: reject obviously hostile path shapes before parsing.
    // These can escape the origin host or smuggle credentials during URL
    // construction, even if they survived normalizeAndValidatePath.
    if (validatedPath.includes('\\') || validatedPath.startsWith('//')) {
        throw new ParameterError(
            'Resolved URL host does not match the connection origin',
        );
    }
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(validatedPath)) {
        throw new ParameterError(
            'Resolved URL host does not match the connection origin',
        );
    }
    if (validatedPath.includes('@')) {
        throw new ParameterError(
            'Resolved URL host does not match the connection origin',
        );
    }

    const originUrl = new URL(origin);
    const base = origin.endsWith('/') ? origin.slice(0, -1) : origin;
    const url = new URL(`${base}${validatedPath}`);

    // Final check: the constructed URL's host must still match the origin.
    if (url.protocol !== originUrl.protocol || url.host !== originUrl.host) {
        throw new ParameterError(
            'Resolved URL host does not match the connection origin',
        );
    }

    if (query) {
        const params = new URLSearchParams();
        for (const [key, value] of Object.entries(query)) {
            params.append(key, value);
        }
        const qs = params.toString();
        if (qs) {
            url.search = qs;
        }
    }
    return url.toString();
}

// Floor a Date to the start of its minute. The caller injects the Date so the
// window is deterministic and unit-testable — we never call Date.now() in the
// fetch path.
export function computeMinuteWindow(now: Date): Date {
    return new Date(Math.floor(now.getTime() / 60_000) * 60_000);
}

export function serializeRequestBody(body: unknown): {
    json: string;
    bytes: number;
} {
    let json: string;
    try {
        json = JSON.stringify(body ?? {});
    } catch {
        throw new ParameterError('Request body is not JSON-serializable');
    }
    // JSON.stringify can return undefined (e.g. a bare function); coerce.
    if (json === undefined) {
        json = '{}';
    }
    return { json, bytes: Buffer.byteLength(json, 'utf8') };
}
