/**
 * Tells the host how far the app has scrolled, so the marks Design Mode
 * keeps over the app stay on what they were drawn on.
 *
 * The app runs in a sandboxed iframe, and its scrolling never reaches the
 * host page. A message carries two numbers, the horizontal and vertical
 * offset in pixels, and nothing about what is on the page.
 *
 * Hosts that do not offer Design Mode, and older hosts, ignore it.
 */

/** Iframe → host: the app's scroll offset, at mount and after each scroll. */
type CaptureScrollMessage = {
    type: 'lightdash:sdk:capture-scroll';
    x: number;
    y: number;
};

export const CAPTURE_SCROLL_MESSAGE = 'lightdash:sdk:capture-scroll';

// A full-height layout scrolls an inner area instead of the page. It counts
// as the page when it fills at least half of the window.
const fillsThePage = (area: Element): boolean =>
    area.clientWidth * area.clientHeight >=
    (window.innerWidth * window.innerHeight) / 2;

let activeCleanup: (() => void) | null = null;

/**
 * Called by `createClient()` when the postMessage transport is detected. One
 * listener per bundle: mounting again replaces the previous listener.
 */
export function mountCaptureScroll(targetWindow: Window): () => void {
    if (typeof window === 'undefined') return () => {};

    let area: Element | null = null;
    let queued = false;

    // Wildcard for the same reason as every other outbound bridge message:
    // the sandboxed iframe has an opaque origin and can't derive the parent's.
    const post = () => {
        queued = false;
        const inner = area?.isConnected ? area : null;
        const message: CaptureScrollMessage = {
            type: CAPTURE_SCROLL_MESSAGE,
            x: window.scrollX + (inner?.scrollLeft ?? 0),
            y: window.scrollY + (inner?.scrollTop ?? 0),
        };
        targetWindow.postMessage(message, '*');
    };

    const handler = (event: Event) => {
        const { target } = event;
        if (
            target instanceof Element &&
            target !== document.documentElement &&
            target !== document.body
        ) {
            // A list or table scrolling inside the page moves no marks.
            if (!fillsThePage(target)) return;
            area = target;
        }
        // At most one message per painted frame.
        if (queued) return;
        queued = true;
        window.requestAnimationFrame(post);
    };

    activeCleanup?.();
    // Capture phase: scroll events from inner areas do not bubble.
    window.addEventListener('scroll', handler, {
        capture: true,
        passive: true,
    });
    const cleanup = () => {
        window.removeEventListener('scroll', handler, { capture: true });
        if (activeCleanup === cleanup) activeCleanup = null;
    };
    activeCleanup = cleanup;
    // A page that has just loaded starts at the top: say so.
    post();
    return cleanup;
}
