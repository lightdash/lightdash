import {
    SDK_FEATURE_KEYS,
    SDK_MANIFEST_MESSAGE_TYPE,
    type SdkManifestMessage,
} from './features';
import { SDK_VERSION } from './generated/sdkVersion';

let activeCleanup: (() => void) | null = null;

/**
 * Announce this bundle's SDK capabilities to the host: immediately, and again
 * whenever the host posts `lightdash:sdk:ready` — whichever side mounts first,
 * the host ends up with a manifest. The host dedupes repeats.
 *
 * One listener per bundle: the manifest is module-constant, so re-creating the
 * transport re-posts instead of stacking duplicate listeners. Returns a
 * cleanup that unregisters the listener.
 */
export function announceSdkManifest(targetWindow: Window): () => void {
    if (typeof window === 'undefined') return () => {};
    const message: SdkManifestMessage = {
        type: SDK_MANIFEST_MESSAGE_TYPE,
        sdkVersion: SDK_VERSION,
        features: SDK_FEATURE_KEYS,
    };
    // Bundles are served from the host page's own origin, and location.origin
    // is URL-derived so it survives the sandboxed (opaque-origin) iframe.
    const { origin } = window.location;
    const targetOrigin = origin && origin !== 'null' ? origin : '*';
    const post = () => targetWindow.postMessage(message, targetOrigin);
    activeCleanup?.();
    const handler = (event: MessageEvent) => {
        if (event.source !== targetWindow) return;
        const type: unknown = (event.data as { type?: unknown })?.type;
        if (type === 'lightdash:sdk:ready') post();
    };
    window.addEventListener('message', handler);
    const cleanup = () => {
        window.removeEventListener('message', handler);
        if (activeCleanup === cleanup) activeCleanup = null;
    };
    activeCleanup = cleanup;
    post();
    return cleanup;
}
