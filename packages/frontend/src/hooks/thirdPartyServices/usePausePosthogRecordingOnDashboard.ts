import posthog from 'posthog-js';
import { useEffect } from 'react';
import useApp from '../../providers/App/useApp';

/**
 * Pauses PostHog session recording while a dashboard page is mounted.
 * PostHog's DOM mutation observer records every change, which causes
 * significant main thread blocking when dashboards mount/unmount many
 * tiles (e.g. tab switches with 20+ charts).
 *
 * Recording resumes automatically when the user navigates away.
 *
 * Controlled by LIGHTDASH_DASHBOARD_DISABLE_POSTHOG_RECORDING=true
 */
export function usePausePosthogRecordingOnDashboard() {
    const { health } = useApp();
    const enabled = health?.data?.dashboard?.disablePosthogRecording ?? false;

    useEffect(() => {
        if (!enabled) return;

        if (posthog.__loaded && posthog.sessionRecordingStarted()) {
            posthog.stopSessionRecording();
        }

        return () => {
            if (posthog.__loaded && !posthog.sessionRecordingStarted()) {
                posthog.startSessionRecording();
            }
        };
    }, [enabled]);
}
