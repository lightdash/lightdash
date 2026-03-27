import { useCallback, useEffect, type RefObject } from 'react';

/**
 * Parent-side fetch proxy for sandboxed iframe SDK communication.
 *
 * The iframe's SDK sends HTTP requests via postMessage (because it has
 * no direct API access). This hook receives those requests, executes
 * them with the current user's session cookies, and posts the raw API
 * response back. It has no knowledge of queries, fields, or result types.
 */
export function useAppSdkBridge(
    iframeRef: RefObject<HTMLIFrameElement | null>,
) {
    const handleMessage = useCallback(
        async (event: MessageEvent) => {
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
                    '*',
                );
            };

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
        [iframeRef],
    );

    useEffect(() => {
        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, [handleMessage]);

    const handleIframeLoad = useCallback(() => {
        iframeRef.current?.contentWindow?.postMessage(
            { type: 'lightdash:sdk:ready' },
            '*',
        );
    }, [iframeRef]);

    return { handleIframeLoad };
}
