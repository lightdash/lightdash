import { validatePublicHttpUrl } from '../../../utils/ssrfProtection';

const TDCP_FETCH_TIMEOUT_MS = 30_000;

/**
 * The egress fetch injected into TdcpClient for both planes: HTTPS only, no
 * URL credentials, hostname must not resolve to a private address, and a
 * hard timeout. Streaming responses pass through untouched.
 *
 * TDCP_ALLOW_PRIVATE_ADDRESSES=true relaxes the address check (and allows
 * plain http) for local development against a fixture server — the same
 * escape hatch MCP has via AI_AGENT_MCP_ALLOW_PRIVATE_ADDRESSES. Never set
 * in production; graduates to lightdashConfig with the sources entity.
 *
 * @oliver: validation resolves DNS separately from the fetch, so a
 * rebinding window remains — closing it needs the pinned-agent treatment
 * secureFetch uses, generalized to streaming bodies. Follow-up, not draft.
 */
export const createTdcpGuardedFetch = (): typeof fetch => {
    const allowPrivateAddresses =
        process.env.TDCP_ALLOW_PRIVATE_ADDRESSES === 'true';
    const guardedFetch = async (
        input: string | URL | Request,
        init?: RequestInit,
    ): Promise<Response> => {
        const url =
            typeof input === 'string' || input instanceof URL
                ? String(input)
                : input.url;
        await validatePublicHttpUrl(url, {
            allowPrivateAddresses,
            allowedProtocols: allowPrivateAddresses
                ? ['https:', 'http:']
                : ['https:'],
        });
        return fetch(url, {
            ...init,
            signal: init?.signal ?? AbortSignal.timeout(TDCP_FETCH_TIMEOUT_MS),
        });
    };
    return guardedFetch;
};
