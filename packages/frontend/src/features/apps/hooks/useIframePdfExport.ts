import { useCallback, useEffect, useRef, type RefObject } from 'react';

/** PDF builds rasterize every report page at 2x inside the iframe, so they
 *  run far longer than a single screenshot. */
const PDF_EXPORT_TIMEOUT_MS = 120_000;

type PendingExport = {
    resolve: (blob: Blob) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
};

/**
 * Provides an `exportPdf()` that asks the sandboxed preview iframe to run
 * the PDF builder the app registered via `registerPdfExport` (the same
 * builder behind its Download PDF button) and post the finished Blob back.
 * Mirrors `useIframeScreenshot` — only bytes cross the sandbox boundary.
 */
export function useIframePdfExport(
    iframeRef: RefObject<HTMLIFrameElement | null>,
) {
    const pending = useRef<Map<string, PendingExport>>(new Map());

    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            // Identity check via `event.source` is unforgeable — the preview
            // iframe's origin is opaque, so we don't gate on origin. Mirrors
            // `useIframeScreenshot`.
            if (event.source !== iframeRef.current?.contentWindow) return;

            const { data } = event;
            if (data?.type !== 'lightdash:sdk:pdf-export-response') return;

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
                request.reject(new Error('PDF export response missing blob'));
                return;
            }

            request.resolve(blob);
        };

        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, [iframeRef]);

    const exportPdf = useCallback(async (): Promise<Blob> => {
        const iframe = iframeRef.current;
        if (!iframe?.contentWindow) {
            throw new Error('Iframe not available');
        }

        const id = crypto.randomUUID();

        return new Promise<Blob>((resolve, reject) => {
            const timer = setTimeout(() => {
                pending.current.delete(id);
                reject(new Error('PDF export timed out'));
            }, PDF_EXPORT_TIMEOUT_MS);

            pending.current.set(id, { resolve, reject, timer });

            // Wildcard targetOrigin for the same opaque-origin reason as
            // `useIframeScreenshot`; delivery is targeted by contentWindow.
            iframe.contentWindow!.postMessage(
                { type: 'lightdash:sdk:pdf-export-request', id },
                '*',
            );
        });
    }, [iframeRef]);

    return { exportPdf };
}
