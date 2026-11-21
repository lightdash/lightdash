/**
 * Forwards the Lightdash editor's Design Mode keys to the host: the toggle
 * (mod+shift+X) and the two hold keys, Option/Alt and Control, each pressed
 * on its own.
 *
 * The app runs in a sandboxed iframe, so once the user clicks inside it the
 * host page stops seeing key presses and its own hotkeys go dead. These are
 * the only keys the SDK passes on. Nothing else the user types leaves the
 * app, and a message says no more than which of the three it was.
 *
 * The host decides what a message means. Hosts that do not offer Design Mode
 * ignore them, and older hosts ignore the hold messages.
 */

/** Iframe → host: the user pressed the capture hotkey inside the app. */
type CaptureHotkeyMessage = {
    type: 'lightdash:sdk:capture-hotkey';
};

export const CAPTURE_HOTKEY_MESSAGE = 'lightdash:sdk:capture-hotkey';

/** Iframe → host: a hold key went down or came up inside the app. */
type CaptureHoldMessage = {
    type: 'lightdash:sdk:capture-hold';
    tool: CaptureHoldTool;
    phase: 'down' | 'up';
};

type CaptureHoldTool = 'stylus' | 'cursor';

export const CAPTURE_HOLD_MESSAGE = 'lightdash:sdk:capture-hold';

// Same rule as the host's own hold keys: Option/Alt draws and Control picks,
// each only when pressed with no other modifier.
const holdToolDown = (event: KeyboardEvent): CaptureHoldTool | null => {
    if (event.repeat || event.metaKey || event.shiftKey) return null;
    if (event.key === 'Alt' && !event.ctrlKey) return 'stylus';
    if (event.key === 'Control' && !event.altKey) return 'cursor';
    return null;
};

// A release is always passed on: the hold may have begun on the host page.
const holdToolUp = (event: KeyboardEvent): CaptureHoldTool | null => {
    if (event.key === 'Alt') return 'stylus';
    if (event.key === 'Control') return 'cursor';
    return null;
};

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
    const postHold = (tool: CaptureHoldTool | null, phase: 'down' | 'up') => {
        if (!tool) return;
        const hold: CaptureHoldMessage = {
            type: CAPTURE_HOLD_MESSAGE,
            tool,
            phase,
        };
        targetWindow.postMessage(hold, '*');
    };

    const handler = (event: KeyboardEvent) => {
        if (!isCaptureHotkey(event)) {
            // The app keeps the key press: the host is only told about it.
            postHold(holdToolDown(event), 'down');
            return;
        }
        // The host handles the combination, as it does on its own page.
        event.preventDefault();
        if (event.repeat) return;
        targetWindow.postMessage(message, '*');
    };
    const upHandler = (event: KeyboardEvent) =>
        postHold(holdToolUp(event), 'up');

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
