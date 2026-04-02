import { useCallback, useEffect, useRef } from 'react';

/**
 * Returns a `notify(version, status)` function that shows an OS notification
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
        (version: number, status: string) => {
            if (notifiedVersionRef.current === version) return;
            notifiedVersionRef.current = version;

            if (
                document.visibilityState !== 'visible' &&
                'Notification' in window &&
                Notification.permission === 'granted'
            ) {
                const title = appName || 'App';
                const isError = status !== 'ready';
                const n = new Notification(
                    isError
                        ? `${title} - build failed`
                        : `${title} - version ready!`,
                    {
                        body: isError
                            ? `Version ${version} failed to build.`
                            : `Version ${version} has finished building.`,
                        icon: '/favicon.ico',
                    },
                );
                n.onclick = () => {
                    window.focus();
                    n.close();
                };
            }
        },
        [appName],
    );
}
