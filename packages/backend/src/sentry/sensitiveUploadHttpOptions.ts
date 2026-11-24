const matchesPathname = (url: string, pattern: RegExp) => {
    try {
        const pathname = new URL(url, 'http://localhost').pathname.replace(
            /\/$/,
            '',
        );
        return pattern.test(pathname);
    } catch {
        return false;
    }
};

export const isSensitiveThreadFileUpload = (url: string) =>
    matchesPathname(url, /(^|\/)api\/v1\/aiAgents\/thread-files(\/|$)/i);

// Staging upload, file replacement, and the token-authorised upload from MCP.
export const isSensitiveCsvUpload = (url: string) =>
    matchesPathname(
        url,
        /(^|\/)api\/v1\/ee\/projects\/[^/]+\/external-sources\/(upload|[^/]+\/(csv|upload))$/i,
    );

// Keep request/actor/error metadata, never the customer document, image or CSV bytes.
export const sensitiveUploadHttpOptions = {
    ignoreIncomingRequestBody: (url: string) =>
        isSensitiveThreadFileUpload(url) || isSensitiveCsvUpload(url),
};
