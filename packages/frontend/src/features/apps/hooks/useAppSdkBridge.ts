import { useCallback, useEffect, useMemo, type RefObject } from 'react';

/**
 * Routes the SDK is allowed to call through the postMessage bridge.
 * Everything else is rejected. Patterns use :param for path segments.
 */
const ALLOWED_ROUTES: Array<{ method: string; pattern: RegExp }> = [
    // Async metric query execution
    {
        method: 'POST',
        pattern: /^\/api\/v2\/projects\/[^/]+\/query\/metric-query$/,
    },
    // Poll for query results
    {
        method: 'GET',
        pattern: /^\/api\/v2\/projects\/[^/]+\/query\/[^/]+$/,
    },
    // Get current user
    { method: 'GET', pattern: /^\/api\/v1\/user$/ },
];

function isAllowedRoute(method: string, path: string): boolean {
    return ALLOWED_ROUTES.some(
        (route) =>
            route.method === method.toUpperCase() && route.pattern.test(path),
    );
}

/**
 * Parent-side fetch proxy for sandboxed iframe SDK communication.
 *
 * The iframe's SDK sends HTTP requests via postMessage (because it has
 * no direct API access). This hook receives those requests, validates
 * them against an allowlist, executes them with the current user's
 * session cookies, and posts the raw API response back.
 *
 * @param previewOrigin — the origin of the preview domain. Used to
 *   verify incoming message origins and target outgoing postMessages.
 */
export function useAppSdkBridge(
    iframeRef: RefObject<HTMLIFrameElement | null>,
    previewOrigin: string,
) {
    // Strip any trailing slash so origin comparison is consistent.
    const normalizedOrigin = useMemo(
        () => previewOrigin.replace(/\/+$/, ''),
        [previewOrigin],
    );

    const handleMessage = useCallback(
        async (event: MessageEvent) => {
            if (event.origin !== normalizedOrigin) return;
            if (event.source !== iframeRef.current?.contentWindow) return;

            const { data } = event;
            if (data?.type !== 'lightdash:sdk:fetch') return;

            const { id, method, path, body } = data;

            const respond = (response: {
                result?: unknown;
                error?: string;
            }) => {
                iframeRef.current?.contentWindow?.postMessage(
                    { type: 'lightdash:sdk:fetch-response', id, ...response },
                    normalizedOrigin,
                );
            };

            if (!isAllowedRoute(method, path)) {
                respond({ error: `Blocked: ${method} ${path}` });
                return;
            }

            try {
                const res = await fetch(path, {
                    method,
                    headers: { 'Content-Type': 'application/json' },
                    ...(body ? { body: JSON.stringify(body) } : {}),
                });

                const json = await res.json();

                if (json.status === 'ok') {
                    respond({ result: json.results });
                } else {
                    respond({
                        error:
                            json.error?.message ?? `API error (${res.status})`,
                    });
                }
            } catch (err) {
                respond({
                    error: err instanceof Error ? err.message : 'Unknown error',
                });
            }
        },
        [iframeRef, normalizedOrigin],
    );

    useEffect(() => {
        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, [handleMessage]);

    const handleIframeLoad = useCallback(() => {
        iframeRef.current?.contentWindow?.postMessage(
            { type: 'lightdash:sdk:ready' },
            normalizedOrigin,
        );
    }, [iframeRef, normalizedOrigin]);

    return { handleIframeLoad };
}
