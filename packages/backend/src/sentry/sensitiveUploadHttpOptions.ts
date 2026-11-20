export const isSensitiveThreadFileUpload = (url: string) => {
    try {
        const pathname = new URL(url, 'http://localhost').pathname.replace(
            /\/$/,
            '',
        );
        return /(^|\/)api\/v1\/aiAgents\/thread-files(\/|$)/i.test(pathname);
    } catch {
        return false;
    }
};

// Keep request/actor/error metadata, never the customer document or image bytes.
export const sensitiveUploadHttpOptions = {
    ignoreIncomingRequestBody: isSensitiveThreadFileUpload,
};
