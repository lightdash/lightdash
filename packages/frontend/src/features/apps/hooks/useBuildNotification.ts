import {
    APP_VERSION_CANCELLED_BY_USER,
    assertUnreachable,
    type ApiAppVersionSummary,
} from '@lightdash/common';
import { useCallback, useEffect, useRef } from 'react';

export type BuildOutcomeKind = 'ready' | 'failed' | 'cancelled';
export type BuildOutcome = { kind: BuildOutcomeKind; version: number };

type BuildNotificationContent = { title: string; body: string };

export const getBuildOutcome = ({
    version,
    status,
    error,
}: ApiAppVersionSummary): BuildOutcome => {
    if (error === APP_VERSION_CANCELLED_BY_USER)
        return { kind: 'cancelled', version };
    return { kind: status === 'ready' ? 'ready' : 'failed', version };
};

/**
 * Build outcome notification copy, or null when nothing should be shown
 * (user-cancelled builds are not an outcome worth interrupting for).
 */
export const getBuildNotificationContent = (
    appName: string,
    { kind, version }: BuildOutcome,
): BuildNotificationContent | null => {
    const title = appName || 'App';
    switch (kind) {
        case 'cancelled':
            return null;
        case 'ready':
            return {
                title: `${title} - version ready!`,
                body: `Version ${version} has finished building.`,
            };
        case 'failed':
            return {
                title: `${title} - build failed`,
                body: `Version ${version} failed to build.`,
            };
        default:
            return assertUnreachable(kind, 'Unknown build outcome kind');
    }
};

type UseBuildNotificationOptions = {
    appUuid: string | null;
    appName: string;
    shouldRequestPermission: boolean;
    onClick?: () => void;
};

/**
 * Returns `notify(outcome)`, which shows a build outcome notification when the
 * tab is in the background. Requests permission when `shouldRequestPermission`
 * is true. Each version is notified at most once.
 */
export function useBuildNotification({
    appUuid,
    appName,
    shouldRequestPermission,
    onClick,
}: UseBuildNotificationOptions) {
    useEffect(() => {
        if (shouldRequestPermission && 'Notification' in window) {
            void Notification.requestPermission();
        }
    }, [shouldRequestPermission]);

    const notifiedVersionRef = useRef<number | null>(null);
    const onClickRef = useRef(onClick);
    onClickRef.current = onClick;

    return useCallback(
        (outcome: BuildOutcome) => {
            if (outcome.kind === 'cancelled') return;
            if (notifiedVersionRef.current === outcome.version) return;
            notifiedVersionRef.current = outcome.version;

            const content = getBuildNotificationContent(appName, outcome);
            if (
                content &&
                document.visibilityState !== 'visible' &&
                'Notification' in window &&
                Notification.permission === 'granted'
            ) {
                // Same tag across surfaces so the browser collapses duplicates
                const n = new Notification(content.title, {
                    body: content.body,
                    icon: '/favicon.ico',
                    tag: appUuid ? `${appUuid}:${outcome.version}` : undefined,
                });
                n.onclick = () => {
                    window.focus();
                    n.close();
                    onClickRef.current?.();
                };
            }
        },
        [appUuid, appName],
    );
}
