import mime from 'mime-types';

/**
 * Resolves Content-Type from serve-static's mime db — the same resolver
 * expressStaticGzip uses for disk-served assets — so bucket-served fallback
 * responses can't drift from disk responses (helmet's nosniff makes a
 * mismatched type a hard failure for module scripts). Returns undefined
 * for extensions the db doesn't know, which vite builds never emit.
 */
export const getAssetContentType = (
    relativePath: string,
): string | undefined => {
    const contentType = mime.lookup(relativePath);
    if (!contentType || contentType === 'application/octet-stream') {
        return undefined;
    }
    return mime.contentType(contentType) || contentType;
};
