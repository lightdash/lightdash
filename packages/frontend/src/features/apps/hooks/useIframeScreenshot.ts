import { useCallback, useEffect, useRef, type RefObject } from 'react';

const SCREENSHOT_TIMEOUT_MS = 30_000;

type PendingScreenshot = {
    resolve: (blob: Blob) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
};

/**
 * Provides a `captureScreenshot()` that asks the sandboxed preview iframe
 * to rasterize its own DOM (via html2canvas-pro inside the iframe) and
 * post the resulting PNG blob back. The parent only forwards the blob
 * into a `File` — no HTML serialization, no parent-side rendering, no
 * trust-boundary dance.
 *
 * Capability is announced separately by the iframe via
 * `lightdash:sdk:screenshot-available` and routed through
 * `useAppSdkBridge` — see `onScreenshotAvailable` there.
 */
export function useIframeScreenshot(
    iframeRef: RefObject<HTMLIFrameElement | null>,
) {
    const pending = useRef<Map<string, PendingScreenshot>>(new Map());

    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            // Identity check via `event.source` is unforgeable — it's the
            // actual Window reference, not a string the sender chose. Mirrors
            // `useAppSdkBridge`. Origin can be `"null"` here because the
            // preview iframe has an opaque origin (no `allow-same-origin`),
            // so we don't gate on it.
            if (event.source !== iframeRef.current?.contentWindow) return;

            const { data } = event;
            if (data?.type !== 'lightdash:sdk:screenshot-response') return;

            const { id, blob, error } = data;
            const request = pending.current.get(id);
            if (!request) return;

            clearTimeout(request.timer);
            pending.current.delete(id);

            if (error) {
                request.reject(new Error(error));
                return;
            }

            if (!(blob instanceof Blob)) {
                request.reject(new Error('Screenshot response missing blob'));
                return;
            }

            request.resolve(blob);
        };

        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, [iframeRef]);

    const captureScreenshot = useCallback(async (): Promise<File> => {
        const iframe = iframeRef.current;
        if (!iframe?.contentWindow) {
            throw new Error('Iframe not available');
        }

        const id = crypto.randomUUID();

        const blob = await new Promise<Blob>((resolve, reject) => {
            const timer = setTimeout(() => {
                pending.current.delete(id);
                reject(new Error('Screenshot timed out'));
            }, SCREENSHOT_TIMEOUT_MS);

            pending.current.set(id, { resolve, reject, timer });

            // Wildcard targetOrigin — the preview iframe is sandboxed without
            // `allow-same-origin` so its origin is opaque (`"null"`); a
            // specific targetOrigin would be silently dropped. Delivery is
            // targeted by `iframe.contentWindow`, not by origin, and the
            // payload carries no sensitive data. Mirrors `useAppSdkBridge`'s
            // parent→iframe sends.
            iframe.contentWindow!.postMessage(
                { type: 'lightdash:sdk:screenshot-request', id },
                '*',
            );
        });

        return new File([blob], 'screenshot.png', { type: blob.type });
    }, [iframeRef]);

    return { captureScreenshot };
}
