import { useEffect, useState } from 'react';

/** Whether the running app can be marked: it must picture itself and say what is at a point. */
export type DesignModeSupport = 'checking' | 'ready' | 'needs-update';

/** How long an app gets to say what it can do before it counts as too old. */
export const ANNOUNCE_GRACE_MS = 3000;

/**
 * An app announces what it can do a moment after it loads, so nothing is
 * called missing until it has had time to say so.
 */
export const useDesignModeSupport = ({
    screenshotAvailable,
    inspectAtAvailable,
    bundleKey,
}: {
    screenshotAvailable: boolean;
    inspectAtAvailable: boolean;
    /** The app and version on show: a new one gets its own time to announce. */
    bundleKey: string | null;
}): DesignModeSupport => {
    const ready = screenshotAvailable && inspectAtAvailable;
    const waitingOn = `${bundleKey ?? ''}|${screenshotAvailable}|${inspectAtAvailable}`;
    const [waitedOutOn, setWaitedOutOn] = useState<string | null>(null);
    useEffect(() => {
        if (ready) return undefined;
        const timer = window.setTimeout(
            () => setWaitedOutOn(waitingOn),
            ANNOUNCE_GRACE_MS,
        );
        return () => window.clearTimeout(timer);
    }, [ready, waitingOn]);
    if (ready) return 'ready';
    return waitedOutOn === waitingOn ? 'needs-update' : 'checking';
};
