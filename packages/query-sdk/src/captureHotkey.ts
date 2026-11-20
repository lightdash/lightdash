/**
 * Forwards the Lightdash editor's capture hotkey (mod+shift+X) to the host.
 *
 * The app runs in a sandboxed iframe, so once the user clicks inside it the
 * host page stops seeing key presses and its own hotkey goes dead. This is the
 * one combination the SDK passes on. Nothing else the user types leaves the
 * app, and the message carries no detail about the key press.
 *
 * The host decides what the message means. Hosts that do not offer capture
 * ignore it.
 */

/** Iframe → host: the user pressed the capture hotkey inside the app. */
type CaptureHotkeyMessage = {
    type: 'lightdash:sdk:capture-hotkey';
};

export const CAPTURE_HOTKEY_MESSAGE = 'lightdash:sdk:capture-hotkey';

// Same match as the host's own `mod+shift+X` binding: ctrl or cmd, shift, no
// alt. `code` covers layouts where shift or cmd changes the typed character.
const isCaptureHotkey = (event: KeyboardEvent): boolean =>
    (event.ctrlKey || event.metaKey) &&
    event.shiftKey &&
    !event.altKey &&
    (event.key.toLowerCase() === 'x' || event.code === 'KeyX');

let activeCleanup: (() => void) | null = null;

/**
 * Called by `createClient()` when the postMessage transport is detected. One
 * listener per bundle: mounting again replaces the previous listener.
 */
export function mountCaptureHotkey(targetWindow: Window): () => void {
    if (typeof window === 'undefined') return () => {};

    const message: CaptureHotkeyMessage = { type: CAPTURE_HOTKEY_MESSAGE };

    const handler = (event: KeyboardEvent) => {
        if (!isCaptureHotkey(event)) return;
        // The host handles the combination, as it does on its own page.
        event.preventDefault();
        if (event.repeat) return;
        // Wildcard for the same reason as every other outbound bridge message:
        // the sandboxed iframe has an opaque origin and can't derive the
        // parent's.
        targetWindow.postMessage(message, '*');
    };

    activeCleanup?.();
    // Capture phase, so app code that stops key events can't swallow it.
    window.addEventListener('keydown', handler, true);
    const cleanup = () => {
        window.removeEventListener('keydown', handler, true);
        if (activeCleanup === cleanup) activeCleanup = null;
    };
    activeCleanup = cleanup;
    return cleanup;
}
