import html2canvas from 'html2canvas-pro';
import { useCallback, useEffect, useRef, type RefObject } from 'react';

const SCREENSHOT_TIMEOUT_MS = 10_000;

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
 * html2canvas-pro (which is NOT sandboxed, so it works normally).
 */
async function renderSnapshotToFile(snapshot: SnapshotPayload): Promise<File> {
    const iframe = document.createElement('iframe');
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

            if (!html) {
                request.reject(new Error('No snapshot data received'));
                return;
            }

            request.resolve({ html, width, height });
        };

        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, []);

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
