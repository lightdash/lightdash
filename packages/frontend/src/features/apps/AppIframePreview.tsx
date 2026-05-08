import { useCallback, useEffect, useRef, type FC } from 'react';
import {
    useAppSdkBridge,
    type ElementSelectedEvent,
    type QueryEvent,
} from './hooks/useAppSdkBridge';

type Props = {
    src: string;
    /** Origin the iframe will load from — used to gate the postMessage bridge.
     *  Same value for all preview iframes from the same Lightdash instance
     *  (the configured preview-host), or the parent's own origin in the
     *  same-origin fallback case. */
    expectedPreviewOrigin: string;
    /** Stable identity for the served bundle (e.g. `${appUuid}:${version}`).
     *  Drives the inspector-availability reset — changes here mean a new
     *  bundle whose SDK capabilities are unknown, so we re-await an announce.
     *  A pure URL bump (e.g. the manual refresh counter) keeps this stable
     *  so the Inspect button doesn't flash off and back on. */
    identityKey: string;
    onQueryEvent?: (event: QueryEvent) => void;
    onElementSelected?: (event: ElementSelectedEvent) => void;
    /** When true, the iframe-side inspector overlay is active and clicks
     *  are intercepted to produce element-selected events. */
    inspectorEnabled?: boolean;
    /** Called whenever the iframe SDK announces (or fails to announce) the
     *  inspector capability. Stays `false` until the SDK posts
     *  `lightdash:inspect:available`, so older sandboxes (resumed with a
     *  pre-inspector SDK) keep this `false` and let the parent hide the
     *  Inspect button. Resets to `false` on every `identityKey` change. */
    onInspectorAvailabilityChange?: (available: boolean) => void;
    /** Called when the user presses Esc to leave inspect mode. The handler
     *  lives on the parent's window because that's where focus actually
     *  sits during inspect mode (the toolbar button before any click; the
     *  prompt editor after each click — TipTap yanks focus back on insert). */
    onInspectorCancelled?: () => void;
};

/**
 * Renders a sandboxed app preview iframe with a postMessage fetch proxy.
 *
 * The iframe has `sandbox="allow-scripts allow-modals"` (no `allow-same-origin`),
 * so it cannot access the parent's cookies. `allow-modals` lets generated apps
 * call `window.print()` (needed for PDF Report templates) - it also enables
 * `alert`/`confirm`/`prompt`, which is acceptable here since the iframe is
 * already isolated from parent origin. The SDK inside the iframe routes all
 * API calls through postMessage, and this component's bridge executes them
 * using the current user's session.
 */
const AppIframePreview: FC<Props> = ({
    src,
    expectedPreviewOrigin,
    identityKey,
    onQueryEvent,
    onElementSelected,
    inspectorEnabled,
    onInspectorAvailabilityChange,
    onInspectorCancelled,
}) => {
    const iframeRef = useRef<HTMLIFrameElement>(null);
    // Memoized so the bridge's message listener doesn't re-attach on every
    // parent render — AppGenerate re-renders on every keystroke (editor's
    // `onUpdate` → `setIsPromptEmpty`) and we don't want to thrash listeners.
    const handleAnnounce = useCallback(() => {
        onInspectorAvailabilityChange?.(true);
    }, [onInspectorAvailabilityChange]);
    const { handleIframeLoad, enableInspector, disableInspector } =
        useAppSdkBridge(
            iframeRef,
            expectedPreviewOrigin,
            onQueryEvent,
            onElementSelected,
            handleAnnounce,
        );

    // Reset availability to false when the served bundle changes (new app or
    // new version). Fires before the browser starts loading the new content,
    // so the new SDK's `available` announce will flip it back to true if it's
    // wired up. Old SDKs in resumed sandboxes never announce, so it stays
    // false. Keyed on `identityKey` rather than `src` so that pure URL bumps
    // (manual preview refresh) don't reset — same bundle means same SDK
    // capability, and resetting would briefly hide the Inspect button.
    useEffect(() => {
        onInspectorAvailabilityChange?.(false);
    }, [identityKey, onInspectorAvailabilityChange]);

    // Toggling the prop while the iframe is alive — push the change through.
    useEffect(() => {
        if (inspectorEnabled) enableInspector();
        else disableInspector();
    }, [inspectorEnabled, enableInspector, disableInspector]);

    // Esc-to-cancel. Lives on the parent's window because focus is on the
    // parent (the toolbar button before any click; the editor afterwards) —
    // the iframe never holds focus during inspect mode, so an iframe-side
    // keydown listener would never fire.
    useEffect(() => {
        if (!inspectorEnabled) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onInspectorCancelled?.();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [inspectorEnabled, onInspectorCancelled]);

    // The iframe reloads on every new app version. The useEffect above won't
    // re-fire if `inspectorEnabled` was already true, so re-sync on load.
    const handleLoad = () => {
        handleIframeLoad();
        if (inspectorEnabled) enableInspector();
    };

    return (
        <iframe
            ref={iframeRef}
            src={src}
            style={{ width: '100%', height: '100%', border: 'none' }}
            title="App preview"
            sandbox="allow-scripts allow-modals"
            allow=""
            onLoad={handleLoad}
        />
    );
};

export default AppIframePreview;
