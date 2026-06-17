export type SecureFetchReason =
    | 'non_https'
    | 'blocked_ip'
    | 'invalid_url'
    | 'redirect'
    | 'timeout'
    | 'too_large'
    | 'disallowed_content_type'
    | 'request_failed';

export class SecureFetchError extends Error {
    public readonly reason: SecureFetchReason;

    constructor(reason: SecureFetchReason, message: string) {
        super(message);
        this.name = 'SecureFetchError';
        this.reason = reason;
        Object.setPrototypeOf(this, SecureFetchError.prototype);
    }
}

export type SecureFetchOptions = {
    method: 'GET' | 'POST';
    body?: string;
    headers?: Record<string, string>;
    timeoutMs: number;
    maxResponseBytes: number;
    allowedContentTypes: string[];
};

export type SecureFetchResult = {
    status: number;
    contentType: string;
    bodyText: string;
    truncated: boolean;
};

export async function secureFetch(
    rawUrl: string,
    options: SecureFetchOptions,
): Promise<SecureFetchResult> {
    throw new SecureFetchError('request_failed', 'secureFetch not implemented');
}
