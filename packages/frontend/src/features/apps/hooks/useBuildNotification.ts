import {
    APP_VERSION_CANCELLED_BY_USER,
    type ApiAppVersionSummary,
} from '@lightdash/common';
import { useCallback, useEffect, useRef } from 'react';

type BuildNotificationContent = { title: string; body: string };

/**
 * Notification copy for a finished build, or null when nothing should be
 * shown (user-cancelled builds are not an outcome worth interrupting for).
 */
export const getBuildNotificationContent = (
    appName: string,
    { version, status, error }: ApiAppVersionSummary,
): BuildNotificationContent | null => {
    if (error === APP_VERSION_CANCELLED_BY_USER) return null;
    const title = appName || 'App';
    return status === 'ready'
        ? {
              title: `${title} - version ready!`,
              body: `Version ${version} has finished building.`,
          }
        : {
              title: `${title} - build failed`,
              body: `Version ${version} failed to build.`,
          };
};

/**
 * Returns a `notify(version)` function that shows an OS notification
 * when a build completes — but only when the tab is in the background.
 *
 * Automatically requests notification permission when `shouldRequestPermission`
 * is true (typically when a generation starts).
 *
 * Each version is only notified once, even if called multiple times.
 */
export function useBuildNotification(
    appName: string,
    shouldRequestPermission: boolean,
) {
    useEffect(() => {
        if (shouldRequestPermission && 'Notification' in window) {
            void Notification.requestPermission();
        }
    }, [shouldRequestPermission]);

    const notifiedVersionRef = useRef<number | null>(null);

    return useCallback(
        (summary: ApiAppVersionSummary) => {
            if (notifiedVersionRef.current === summary.version) return;
            notifiedVersionRef.current = summary.version;

            const content = getBuildNotificationContent(appName, summary);
            if (
                content &&
                document.visibilityState !== 'visible' &&
                'Notification' in window &&
                Notification.permission === 'granted'
            ) {
                const n = new Notification(content.title, {
                    body: content.body,
                    icon: '/favicon.ico',
                });
                n.onclick = () => {
                    window.focus();
                    n.close();
                };
            }
        },
        [appName],
    );
}
