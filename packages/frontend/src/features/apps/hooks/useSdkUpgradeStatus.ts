import { SDK_FEATURES, type SdkFeature } from '@lightdash/common';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type SdkManifest } from './useAppSdkBridge';

/** How long the classified bundle may render without reporting before it
 *  counts as legacy. */
const LEGACY_TIMEOUT_MS = 5000;

export type SdkUpgradeStatus = 'unknown' | 'legacy' | 'current' | 'stale';

export type SdkUpgradeOffer = {
    status: SdkUpgradeStatus;
    /** Registry entries the running bundle lacks; empty for legacy (its
     *  feature set is unknown, so the What's-new UI shows generic copy). */
    newFeatures: SdkFeature[];
    /** What the upgrade request sends as possibly-new: the delta when stale,
     *  the full registry when legacy (feature set unknown). The in-sandbox
     *  agent verifies each against the installed SDK and never invents more. */
    candidateFeatures: SdkFeature[];
    reportedSdkVersion: string | null;
    reportedFeatures: string[] | null;
};

/**
 * Classifies an app's latest ready bundle against the current SDK feature
 * registry. The bundle self-reports via `lightdash:sdk:manifest`
 * (`onSdkManifest` feeds it in); a bundle that stays silent past the timeout
 * is `legacy` (built before feature reporting). Nothing is persisted — the
 * running bundle is the only source of truth, so a rollback that makes an
 * older bundle the latest ready one legitimately re-lights the offer.
 *
 * The offer always describes the version an upgrade would actually rebuild
 * from — `upgradeApp` restores the latest ready source regardless of what the
 * user is previewing — so manifests from any other version are ignored.
 */
export const useSdkUpgradeStatus = ({
    bundleKey,
    renderedKey,
    isRendering,
}: {
    /** Identity (app + version) of the bundle the offer describes: the latest
     *  ready version, never the one the user happens to be viewing. A change
     *  resets the manifest so the new bundle re-reports rather than inheriting
     *  the previous one's. Null = nothing to classify. */
    bundleKey: string | null;
    /** Identity (app + version) of the bundle on screen; null = no preview.
     *  A change clears the rendered manifest so the new bundle re-reports. */
    renderedKey: string | null;
    /** Whether the preview is currently running that bundle. While it is not,
     *  the last classification stands: manifests belong to some other version
     *  and the legacy timeout would fire against a bundle that never got the
     *  chance to report. */
    isRendering: boolean;
}) => {
    const [manifest, setManifest] = useState<SdkManifest | null>(null);
    const [renderedManifest, setRenderedManifest] =
        useState<SdkManifest | null>(null);
    const [timedOut, setTimedOut] = useState(false);

    const isRenderingRef = useRef(isRendering);
    useEffect(() => {
        isRenderingRef.current = isRendering;
    }, [isRendering]);

    useEffect(() => {
        setManifest(null);
        setTimedOut(false);
    }, [bundleKey]);

    useEffect(() => {
        setRenderedManifest(null);
    }, [renderedKey]);

    // The iframe is an external system — keyed reset + timeout is
    // synchronisation, not prop-mirroring.
    useEffect(() => {
        if (bundleKey === null || !isRendering) return undefined;
        const timer = setTimeout(() => setTimedOut(true), LEGACY_TIMEOUT_MS);
        return () => clearTimeout(timer);
    }, [bundleKey, isRendering]);

    // Stable identity: the bridge re-subscribes its window listener whenever
    // this changes, so the gate reads a ref rather than closing over the flag.
    const onSdkManifest = useCallback((reported: SdkManifest) => {
        setRenderedManifest(reported);
        if (!isRenderingRef.current) return;
        setManifest(reported);
    }, []);

    const offer = useMemo<SdkUpgradeOffer>(() => {
        if (manifest) {
            const reported = new Set(manifest.features);
            // Additions only: keys the bundle reports that the current
            // registry no longer has (removed features) are ignored.
            const newFeatures = SDK_FEATURES.filter(
                (f) => !reported.has(f.key),
            );
            return {
                status: newFeatures.length > 0 ? 'stale' : 'current',
                newFeatures,
                candidateFeatures: newFeatures,
                reportedSdkVersion: manifest.sdkVersion,
                reportedFeatures: manifest.features,
            };
        }
        return {
            status: timedOut ? 'legacy' : 'unknown',
            newFeatures: [],
            candidateFeatures: timedOut ? [...SDK_FEATURES] : [],
            reportedSdkVersion: null,
            reportedFeatures: null,
        };
    }, [manifest, timedOut]);

    /** What the bundle on screen reports, whichever version that is. Answers
     *  "can the app I am looking at do X?" — a different question from the
     *  offer, which describes the version an upgrade would rebuild from. */
    return { offer, renderedManifest, onSdkManifest };
};
