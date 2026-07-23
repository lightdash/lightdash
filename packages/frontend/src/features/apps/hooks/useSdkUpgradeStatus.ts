import { SDK_FEATURES, type SdkFeature } from '@lightdash/query-sdk/features';
import { useEffect, useMemo, useState } from 'react';
import { type SdkManifest } from './useAppSdkBridge';

/** How long after a preview mounts before a silent bundle counts as legacy. */
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
 * Classifies the previewed app bundle against the current SDK feature
 * registry. The bundle self-reports via `lightdash:sdk:manifest`
 * (`onSdkManifest` feeds it in); a bundle that stays silent past the timeout
 * is `legacy` (built before feature reporting). Nothing is persisted — the
 * running bundle is the only source of truth, so restoring an old version
 * legitimately re-lights the offer.
 */
export const useSdkUpgradeStatus = ({
    resetKey,
}: {
    /** Identity of the previewed bundle (app + version); null = no preview.
     *  A change resets the manifest so a rolled-back or newly deployed
     *  version re-reports rather than inheriting the previous bundle's. */
    resetKey: string | null;
}) => {
    const [manifest, setManifest] = useState<SdkManifest | null>(null);
    const [timedOut, setTimedOut] = useState(false);

    // The iframe is an external system — keyed reset + timeout is
    // synchronisation, not prop-mirroring.
    useEffect(() => {
        setManifest(null);
        setTimedOut(false);
        if (resetKey === null) return undefined;
        const timer = setTimeout(() => setTimedOut(true), LEGACY_TIMEOUT_MS);
        return () => clearTimeout(timer);
    }, [resetKey]);

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

    return { offer, onSdkManifest: setManifest };
};
