import html2canvas from 'html2canvas-pro';
import { useCallback, useEffect, useRef, type RefObject } from 'react';

const SCREENSHOT_TIMEOUT_MS = 10_000;
// 8 MiB of UTF-16 code units. A realistic dashboard's serialized DOM with
// inlined styles sits well under 1 MiB; this guard exists to bound a hostile
// snapshot's ability to crash the parent tab via `iframe.srcdoc =` of a
// pathologically large string. Counted in `string.length` (code units) for
// cheap measurement; ~16 MiB worst-case UTF-8 bytes is still acceptable.
const MAX_SNAPSHOT_BYTES = 8 * 1024 * 1024;

type SnapshotPayload = {
    html: string;
    width: number;
    height: number;
};

type PendingScreenshot = {
    resolve: (payload: SnapshotPayload) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
};

/**
 * Render a DOM snapshot in a hidden srcdoc iframe and capture it with
 * html2canvas-pro.
 *
 * Security: the snapshot iframe carries `sandbox="allow-same-origin"`. The
 * data app whose DOM we're rendering is untrusted (Claude-generated; prompt
 * injection from the dbt catalog or a hostile share could turn it adversarial),
 * and its serialized HTML may contain `<script>`, event handlers, or
 * `javascript:` URLs. Without the sandbox attribute, srcdoc iframes inherit
 * the embedder's origin and those payloads would execute as the user, in
 * Lightdash's origin — a full sandbox escape from the preview iframe. The
 * `allow-same-origin` token (and ONLY that token) keeps the iframe same-origin
 * with the parent (so `contentDocument` is readable for html2canvas) while
 * blocking scripts, forms, top-nav, and popups.
 */
async function renderSnapshotToFile(snapshot: SnapshotPayload): Promise<File> {
    const iframe = document.createElement('iframe');
    iframe.sandbox.add('allow-same-origin');
    iframe.style.cssText =
        'position:fixed;left:-9999px;top:0;border:none;visibility:hidden;';
    iframe.width = String(snapshot.width);
    iframe.height = String(snapshot.height);
    iframe.srcdoc = `<!DOCTYPE html>${snapshot.html}`;
    document.body.appendChild(iframe);

    try {
        // Wait for the srcdoc iframe to load
        await new Promise<void>((resolve) => {
            iframe.onload = () => resolve();
        });

        const body = iframe.contentDocument?.body;
        if (!body) throw new Error('Could not access snapshot iframe body');

        const canvas = await html2canvas(body, {
            width: snapshot.width,
            height: snapshot.height,
            logging: false,
            scale: Math.min(2, window.devicePixelRatio || 1),
        });

        const dataUrl = canvas.toDataURL('image/png');
        const byteString = atob(dataUrl.split(',')[1]);
        const mimeType =
            dataUrl.split(',')[0].match(/:(.*?);/)?.[1] ?? 'image/png';
        const ab = new ArrayBuffer(byteString.length);
        const ia = new Uint8Array(ab);
        for (let i = 0; i < byteString.length; i++) {
            ia[i] = byteString.charCodeAt(i);
        }
        return new File(
            [new Blob([ab], { type: mimeType })],
            'screenshot.png',
            {
                type: mimeType,
            },
        );
    } finally {
        document.body.removeChild(iframe);
    }
}

/**
 * Provides a `captureScreenshot()` function that requests a DOM snapshot
 * from a sandboxed iframe via postMessage, renders it in a hidden iframe
 * on the parent side, and captures it with html2canvas-pro.
 */
export function useIframeScreenshot(
    iframeRef: RefObject<HTMLIFrameElement | null>,
) {
    const pending = useRef<Map<string, PendingScreenshot>>(new Map());

    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            // Identity check: the screenshot response must come from the
            // preview iframe we sent the request to. `event.source` is
            // unforgeable — it's the actual `Window` reference, not a string
            // the sender chose. Without this, any window in the tree (an
            // embedded widget, a content-script-injected iframe, a popup we
            // gave a handle to) could deliver attacker-chosen HTML that we'd
            // then render in the snapshot iframe. Mirrors `useAppSdkBridge`.
            if (event.source !== iframeRef.current?.contentWindow) return;

            const { data } = event;
            if (data?.type !== 'lightdash:sdk:screenshot-response') return;

            const { id, html, width, height, error } = data;
            const request = pending.current.get(id);
            if (!request) return;

            clearTimeout(request.timer);
            pending.current.delete(id);

            if (error) {
                request.reject(new Error(error));
                return;
            }

            if (typeof html !== 'string' || !html) {
                request.reject(new Error('No snapshot data received'));
                return;
            }

            // Reject pathologically large snapshots before they reach
            // `iframe.srcdoc = ...` and crash the parent tab.
            if (html.length > MAX_SNAPSHOT_BYTES) {
                request.reject(
                    new Error(
                        `Snapshot too large (${html.length} > ${MAX_SNAPSHOT_BYTES} bytes)`,
                    ),
                );
                return;
            }

            request.resolve({ html, width, height });
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

        const snapshot = await new Promise<SnapshotPayload>(
            (resolve, reject) => {
                const timer = setTimeout(() => {
                    pending.current.delete(id);
                    reject(new Error('Screenshot timed out'));
                }, SCREENSHOT_TIMEOUT_MS);

                pending.current.set(id, { resolve, reject, timer });

                // Wildcard targetOrigin — the preview iframe is sandboxed
                // without `allow-same-origin` so its origin is opaque
                // (`"null"`); a specific targetOrigin would be silently
                // dropped. Delivery is targeted by `iframe.contentWindow`,
                // not by origin, and the payload carries no sensitive data.
                // Mirrors `useAppSdkBridge`'s parent→iframe sends.
                iframe.contentWindow!.postMessage(
                    { type: 'lightdash:sdk:screenshot-request', id },
                    '*',
                );
            },
        );

        return renderSnapshotToFile(snapshot);
    }, [iframeRef]);

    return { captureScreenshot };
}
