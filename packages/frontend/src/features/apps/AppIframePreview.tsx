import { type DashboardFilters } from '@lightdash/common';
import {
    forwardRef,
    useCallback,
    useEffect,
    useImperativeHandle,
    useRef,
} from 'react';
import {
    useAppSdkBridge,
    type ElementSelectedEvent,
    type QueryEvent,
} from './hooks/useAppSdkBridge';
import { useIframeScreenshot } from './hooks/useIframeScreenshot';

export type AppIframePreviewHandle = {
    captureScreenshot: () => Promise<File>;
};

type Props = {
    src: string;
    /** Origin the iframe will load from — used to gate the postMessage bridge.
     *  Same value for all preview iframes from the same Lightdash instance
     *  (the configured preview-host), or the parent's own origin in the
     *  same-origin fallback case. */
    expectedPreviewOrigin: string;
    /** Project the iframe's external-fetch calls run against. */
    projectUuid: string;
    /** App the iframe's external-fetch calls are attributed to. */
    appUuid: string;
    /** Stable identity scope for the SDK capability handshake — typically the
     *  app UUID. Drives the inspector/screenshot availability resets, so a
     *  change here means a new app whose SDK capabilities are unknown and we
     *  re-await the announces. Pure URL bumps (manual refresh counter) and
     *  version switches within the same app keep this stable so the
     *  Inspect/Screenshot buttons don't flicker off-then-back-on each time. */
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
    /** Same handshake as the inspector, for screenshot capture. The iframe
     *  template that ships html2canvas-pro posts
     *  `lightdash:sdk:screenshot-available` on mount; older templates in
     *  resumed sandboxes never announce, so the Screenshot button stays
     *  hidden for them. */
    onScreenshotAvailabilityChange?: (available: boolean) => void;
    /** Called when the user presses Esc to leave inspect mode. The handler
     *  lives on the parent's window because that's where focus actually
     *  sits during inspect mode (the toolbar button before any click; the
     *  prompt editor after each click — TipTap yanks focus back on insert). */
    onInspectorCancelled?: () => void;
    /** When true, clicks inside the iframe are intercepted to reveal the query. */
    lineageEnabled?: boolean;
    onLineageAvailabilityChange?: (available: boolean) => void;
    onLineageSelected?: (event: { queryUuid: string }) => void;
    /** queryUuid whose rendered elements should be outlined (null clears). */
    lineageHighlightQueryUuid?: string | null;
    onLineageCancelled?: () => void;
    /** Dashboard filters to merge into every metric-query the iframe runs.
     *  Set by `DashboardDataAppTile`; left undefined by `AppGenerate` where
     *  there's no dashboard context. */
    dashboardFilters?: DashboardFilters;
    /** When true, every metric-query the iframe runs is sent with
     *  `invalidateCache` so the backend bypasses the warehouse results cache.
     *  Set by `DashboardDataAppTile` after a dashboard refresh, mirroring what
     *  chart tiles send; left undefined elsewhere. */
    invalidateCache?: boolean;
    /** Fired on every iframe `onload` (including the initial about:blank).
     *  Used by `MinimalApp` to gate the screenshot readiness signal. */
    onIframeLoad?: () => void;
    /** SDK capabilities the host opts into. Closed by default — hosts that
     *  serve untrusted viewers (embed/JWT) must omit each capability flag.
     *  `gsheetExport`: enables `exportToSheets()` from the iframe SDK. */
    capabilities?: { gsheetExport?: boolean };
};

/**
 * Renders a sandboxed app preview iframe with a postMessage fetch proxy.
 *
 * The iframe is sandboxed without `allow-same-origin`, so it cannot access the
 * parent's cookies. `allow-modals` lets generated apps call `window.print()`
 * (needed for PDF Report templates) - it also enables `alert`/`confirm`/`prompt`,
 * which is acceptable here since the iframe is already isolated from parent
 * origin. `allow-downloads` lets generated apps save backend-generated
 * CSV/XLSX exports. `allow-popups-to-escape-sandbox` lets cards open links in
 * a new un-sandboxed tab, and `allow-top-navigation-by-user-activation` lets a
 * clicked link navigate the current tab (e.g. to another dashboard) without
 * letting app code redirect the page silently. None of these grant
 * `allow-same-origin`, so the parent session stays inaccessible. The SDK inside
 * the iframe routes all API calls through postMessage, and this component's
 * bridge executes them using the current user's session.
 *
 * Exposes a `captureScreenshot()` imperative handle for the parent. The
 * iframe rasterizes its own DOM with html2canvas-pro and posts the PNG
 * blob back over postMessage — see `useIframeScreenshot` and
 * `sandboxes/data-apps/template/src/screenshotHandler.js`.
 */
const AppIframePreview = forwardRef<AppIframePreviewHandle, Props>(
    (
        {
            src,
            expectedPreviewOrigin,
            projectUuid,
            appUuid,
            identityKey,
            onQueryEvent,
            onElementSelected,
            inspectorEnabled,
            onInspectorAvailabilityChange,
            onScreenshotAvailabilityChange,
            onInspectorCancelled,
            lineageEnabled,
            onLineageAvailabilityChange,
            onLineageSelected,
            lineageHighlightQueryUuid,
            onLineageCancelled,
            dashboardFilters,
            invalidateCache,
            onIframeLoad,
            capabilities,
        },
        ref,
    ) => {
        const iframeRef = useRef<HTMLIFrameElement>(null);
        // Memoized so the bridge's message listener doesn't re-attach on every
        // parent render — AppGenerate re-renders on every keystroke (editor's
        // `onUpdate` → `setIsPromptEmpty`) and we don't want to thrash listeners.
        const handleInspectorAnnounce = useCallback(() => {
            onInspectorAvailabilityChange?.(true);
        }, [onInspectorAvailabilityChange]);
        const handleScreenshotAnnounce = useCallback(() => {
            onScreenshotAvailabilityChange?.(true);
        }, [onScreenshotAvailabilityChange]);
        const handleLineageAnnounce = useCallback(() => {
            onLineageAvailabilityChange?.(true);
        }, [onLineageAvailabilityChange]);
        const {
            handleIframeLoad,
            enableInspector,
            disableInspector,
            enableLineage,
            disableLineage,
            highlightLineage,
        } = useAppSdkBridge(
            iframeRef,
            expectedPreviewOrigin,
            projectUuid,
            appUuid,
            onQueryEvent,
            onElementSelected,
            handleInspectorAnnounce,
            handleScreenshotAnnounce,
            dashboardFilters,
            invalidateCache,
            capabilities,
            handleLineageAnnounce,
            onLineageSelected,
        );
        const { captureScreenshot } = useIframeScreenshot(iframeRef);

        useImperativeHandle(ref, () => ({ captureScreenshot }), [
            captureScreenshot,
        ]);

        // Reset availability to false when the served bundle changes (new app or
        // new version). Fires before the browser starts loading the new content,
        // so the new SDK's `available` announce will flip it back to true if it's
        // wired up. Old SDKs in resumed sandboxes never announce, so it stays
        // false. Keyed on `identityKey` rather than `src` so that pure URL bumps
        // (manual preview refresh) don't reset — same bundle means same SDK
        // capability, and resetting would briefly hide the Inspect/Screenshot
        // buttons.
        useEffect(() => {
            onInspectorAvailabilityChange?.(false);
            onScreenshotAvailabilityChange?.(false);
            onLineageAvailabilityChange?.(false);
        }, [
            identityKey,
            onInspectorAvailabilityChange,
            onScreenshotAvailabilityChange,
            onLineageAvailabilityChange,
        ]);

        // Toggling the prop while the iframe is alive — push the change through.
        useEffect(() => {
            if (inspectorEnabled) enableInspector();
            else disableInspector();
        }, [inspectorEnabled, enableInspector, disableInspector]);

        useEffect(() => {
            if (lineageEnabled) enableLineage();
            else disableLineage();
        }, [lineageEnabled, enableLineage, disableLineage]);

        useEffect(() => {
            highlightLineage(lineageHighlightQueryUuid ?? null);
        }, [lineageHighlightQueryUuid, highlightLineage]);

        // Esc-to-cancel. Lives on the parent's window because focus is on the
        // parent (the toolbar button before any click; the editor afterwards) —
        // the iframe never holds focus during inspect mode, so an iframe-side
        // keydown listener would never fire.
        useEffect(() => {
            if (!inspectorEnabled && !lineageEnabled) return;
            const onKey = (e: KeyboardEvent) => {
                if (e.key === 'Escape') {
                    if (inspectorEnabled) onInspectorCancelled?.();
                    if (lineageEnabled) onLineageCancelled?.();
                }
            };
            window.addEventListener('keydown', onKey);
            return () => window.removeEventListener('keydown', onKey);
        }, [
            inspectorEnabled,
            lineageEnabled,
            onInspectorCancelled,
            onLineageCancelled,
        ]);

        // The iframe reloads on every new app version. The useEffect above won't
        // re-fire if `inspectorEnabled` was already true, so re-sync on load.
        const handleLoad = () => {
            handleIframeLoad();
            if (inspectorEnabled) enableInspector();
            if (lineageEnabled) enableLineage();
            highlightLineage(lineageHighlightQueryUuid ?? null);
            onIframeLoad?.();
        };

        return (
            <iframe
                ref={iframeRef}
                src={src}
                style={{ width: '100%', height: '100%', border: 'none' }}
                title="App preview"
                sandbox="allow-scripts allow-modals allow-downloads allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation"
                allow=""
                onLoad={handleLoad}
            />
        );
    },
);

AppIframePreview.displayName = 'AppIframePreview';

export default AppIframePreview;
