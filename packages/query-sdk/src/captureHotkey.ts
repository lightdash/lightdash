/**
 * Forwards the Lightdash editor's Design Mode keys to the host: the toggle
 * (mod+shift+X) and the hold key, Option/Alt pressed on its own.
 *
 * The app runs in a sandboxed iframe, so once the user clicks inside it the
 * host page stops seeing key presses and its own hotkeys go dead. These are
 * the only keys the SDK passes on. Nothing else the user types leaves the
 * app, and a message says no more than which of the two it was.
 *
 * The host decides what a message means. Hosts that do not offer Design Mode
 * ignore them, and older hosts ignore the hold messages.
 */

/** Iframe → host: the user pressed the capture hotkey inside the app. */
type CaptureHotkeyMessage = {
    type: 'lightdash:sdk:capture-hotkey';
};

export const CAPTURE_HOTKEY_MESSAGE = 'lightdash:sdk:capture-hotkey';

/** Iframe → host: the hold key went down or came up inside the app. */
type CaptureHoldMessage = {
    type: 'lightdash:sdk:capture-hold';
    phase: 'down' | 'up';
};

export const CAPTURE_HOLD_MESSAGE = 'lightdash:sdk:capture-hold';

// Same rule as the host's own hold key: Option/Alt with no other modifier.
// AltGr reports Control as well, so it starts no hold.
const holdDown = (event: KeyboardEvent): boolean =>
    event.key === 'Alt' &&
    !event.repeat &&
    !event.metaKey &&
    !event.shiftKey &&
    !event.ctrlKey;

// A release is always passed on: the hold may have begun on the host page.
const holdUp = (event: KeyboardEvent): boolean => event.key === 'Alt';

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

    // Wildcard for the same reason as every other outbound bridge message:
    // the sandboxed iframe has an opaque origin and can't derive the parent's.
    const postHold = (phase: 'down' | 'up') => {
        const hold: CaptureHoldMessage = { type: CAPTURE_HOLD_MESSAGE, phase };
        targetWindow.postMessage(hold, '*');
    };

    const handler = (event: KeyboardEvent) => {
        if (!isCaptureHotkey(event)) {
            // The app keeps the key press: the host is only told about it.
            if (holdDown(event)) postHold('down');
            return;
        }
        // The host handles the combination, as it does on its own page.
        event.preventDefault();
        if (event.repeat) return;
        targetWindow.postMessage(message, '*');
    };
    const upHandler = (event: KeyboardEvent) => {
        if (holdUp(event)) postHold('up');
    };

    activeCleanup?.();
    // Capture phase, so app code that stops key events can't swallow it.
    window.addEventListener('keydown', handler, true);
    window.addEventListener('keyup', upHandler, true);
    const cleanup = () => {
        window.removeEventListener('keydown', handler, true);
        window.removeEventListener('keyup', upHandler, true);
        if (activeCleanup === cleanup) activeCleanup = null;
    };
    activeCleanup = cleanup;
    return cleanup;
}
