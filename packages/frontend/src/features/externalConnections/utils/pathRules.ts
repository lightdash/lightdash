import { v4 as uuidv4 } from 'uuid';

export type PathMode = 'all' | 'restricted';
// Each prefix carries a stable uuid so the dynamic input list keys on identity,
// not array index (removing a row would otherwise misreconcile inputs below it).
export type PathPrefix = { uuid: string; value: string };

const ALLOW_ALL_PATH_PREFIXES = ['/'];

export const makePathPrefix = (value = ''): PathPrefix => ({
    uuid: uuidv4(),
    value,
});

/** Build the API payload's `allowedPathPrefixes` from the editor state.
 *  "Allow all" maps to the single root prefix — any path under the pinned host
 *  (the host is the real security boundary, enforced by the SSRF guard). */
export const resolvePathPrefixes = (
    mode: PathMode,
    prefixes: PathPrefix[],
): string[] => {
    if (mode === 'all') {
        return ALLOW_ALL_PATH_PREFIXES;
    }
    return prefixes
        .map((p) => p.value.trim())
        .filter(Boolean)
        .map((p) => (p.startsWith('/') ? p : `/${p}`));
};

/** Derive editor state from an existing connection's `allowedPathPrefixes`.
 *  `['/']` (or an empty list, which would reject everything) reads as "allow
 *  all"; anything else is treated as a specific restriction. */
export const derivePathRules = (
    allowedPathPrefixes: string[],
): { mode: PathMode; prefixes: PathPrefix[] } => {
    const isAllowAll =
        allowedPathPrefixes.length === 0 ||
        (allowedPathPrefixes.length === 1 && allowedPathPrefixes[0] === '/');
    if (isAllowAll) {
        return { mode: 'all', prefixes: [] };
    }
    return {
        mode: 'restricted',
        prefixes: allowedPathPrefixes.map((p) => makePathPrefix(p)),
    };
};
