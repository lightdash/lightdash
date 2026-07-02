import express from 'express';

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
    const contentType = express.static.mime.lookup(relativePath);
    if (contentType === 'application/octet-stream') {
        return undefined;
    }
    const charset = express.static.mime.charsets.lookup(contentType, '');
    return charset ? `${contentType}; charset=${charset}` : contentType;
};
