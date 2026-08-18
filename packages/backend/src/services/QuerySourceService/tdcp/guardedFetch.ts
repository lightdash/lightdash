import { validatePublicHttpUrl } from '../../../utils/ssrfProtection';

const TDCP_FETCH_TIMEOUT_MS = 30_000;

/**
 * The egress fetch injected into TdcpClient for both planes: HTTPS only, no
 * URL credentials, hostname must not resolve to a private address, and a
 * hard timeout. Streaming responses pass through untouched.
 *
 * @oliver: validation resolves DNS separately from the fetch, so a
 * rebinding window remains — closing it needs the pinned-agent treatment
 * secureFetch uses, generalized to streaming bodies. Follow-up, not draft.
 */
export const createTdcpGuardedFetch = (): typeof fetch => {
    const guardedFetch = async (
        input: string | URL | Request,
        init?: RequestInit,
    ): Promise<Response> => {
        const url =
            typeof input === 'string' || input instanceof URL
                ? String(input)
                : input.url;
        await validatePublicHttpUrl(url);
        return fetch(url, {
            ...init,
            signal: init?.signal ?? AbortSignal.timeout(TDCP_FETCH_TIMEOUT_MS),
        });
    };
    return guardedFetch;
};
