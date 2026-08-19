import { validatePublicHttpUrl } from '../../../utils/ssrfProtection';

const TDCP_HEADERS_TIMEOUT_MS = 30_000;

/**
 * The egress fetch injected into TdcpClient for both planes: HTTPS only, no
 * URL credentials, hostname must not resolve to a private address, and a
 * hard timeout on receiving response headers. The timeout deliberately does
 * NOT govern body consumption — data-plane streams may take minutes, and
 * their idle protection lives in the import loop that consumes them (the
 * control plane's body is additionally capped by TdcpClient itself).
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
        const headersController = new AbortController();
        const headersTimer = setTimeout(
            () =>
                headersController.abort(
                    new Error(
                        `TDCP server sent no response headers within ${TDCP_HEADERS_TIMEOUT_MS}ms`,
                    ),
                ),
            TDCP_HEADERS_TIMEOUT_MS,
        );
        try {
            return await fetch(url, {
                ...init,
                signal: init?.signal ?? headersController.signal,
            });
        } finally {
            // Headers arrived (or the caller supplied its own signal):
            // stop the timer so it never aborts a streaming body
            clearTimeout(headersTimer);
        }
    };
    return guardedFetch;
};
