import {
    SDK_FEATURE_KEYS,
    SDK_MANIFEST_MESSAGE_TYPE,
    type SdkManifestMessage,
} from './features';
import { SDK_VERSION } from './generated/sdkVersion';

/**
 * Announce this bundle's SDK capabilities to the host: immediately, and again
 * whenever the host posts `lightdash:sdk:ready` — whichever side mounts first,
 * the host ends up with a manifest. The host dedupes repeats.
 */
export function announceSdkManifest(targetWindow: Window): void {
    if (typeof window === 'undefined') return;
    const message: SdkManifestMessage = {
        type: SDK_MANIFEST_MESSAGE_TYPE,
        sdkVersion: SDK_VERSION,
        features: SDK_FEATURE_KEYS,
    };
    const post = () => targetWindow.postMessage(message, '*');
    post();
    window.addEventListener('message', (event: MessageEvent) => {
        if (event.source !== targetWindow) return;
        const type: unknown = (event.data as { type?: unknown })?.type;
        if (type === 'lightdash:sdk:ready') post();
    });
}
