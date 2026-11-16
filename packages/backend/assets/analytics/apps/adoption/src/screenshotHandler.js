/**
 * Rasterizes the iframe's own DOM with html-to-image and posts the
 * resulting PNG blob back to the parent. Doing the capture inside the
 * iframe keeps it on the trust side of the sandbox boundary: pixels
 * (not HTML) cross over, so there's nothing the parent has to neutralize
 * before consuming.
 *
 * Why html-to-image specifically: the preview iframe runs with
 * `sandbox="allow-scripts"` (no `allow-same-origin`), so its origin is
 * opaque. Two opaque origins are never same-origin with each other,
 * which breaks every DOM-to-image library that internally creates a
 * hidden iframe and then reads `iframe.contentDocument` — both
 * html2canvas (clones the whole page into a nested iframe) and
 * modern-screenshot (creates a sandbox iframe to compute default styles)
 * throw "Permission denied to access property 'document' on cross-origin
 * object" here. html-to-image doesn't use that trick — it walks the live
 * DOM and copies `computedStyle.cssText` straight onto the clone, then
 * wraps in SVG <foreignObject>. No nested iframe access, no cross-origin
 * lookups.
 *
 * Mirrors the inspector capability handshake — on init we announce
 * `lightdash:sdk:screenshot-available` so the parent can show a
 * Screenshot button. Older templates loaded by resumed sandboxes don't
 * send this, so the button stays hidden for them.
 */
import { toBlob } from 'html-to-image';

const REQUEST_TYPE = 'lightdash:sdk:screenshot-request';
const RESPONSE_TYPE = 'lightdash:sdk:screenshot-response';
const AVAILABLE_TYPE = 'lightdash:sdk:screenshot-available';

function captureBlob() {
    return toBlob(document.body, {
        pixelRatio: Math.min(2, window.devicePixelRatio || 1),
        cacheBust: false,
    });
}

function initScreenshotHandler() {
    if (typeof window === 'undefined') return;

    window.parent.postMessage({ type: AVAILABLE_TYPE }, '*');

    window.addEventListener('message', async (event) => {
        const { data } = event;
        if (data?.type !== REQUEST_TYPE) return;

        const { id } = data;
        try {
            const blob = await captureBlob();
            if (!blob) throw new Error('html-to-image returned no blob');
            window.parent.postMessage(
                { type: RESPONSE_TYPE, id, blob },
                '*',
            );
        } catch (err) {
            window.parent.postMessage(
                {
                    type: RESPONSE_TYPE,
                    id,
                    error:
                        err instanceof Error ? err.message : 'Screenshot failed',
                },
                '*',
            );
        }
    });
}

export default initScreenshotHandler;
