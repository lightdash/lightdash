import { useEffect, useState, type RefObject } from 'react';
import { v4 as uuidv4 } from 'uuid';

const hasReachCapture = (token: string): boolean => {
    try {
        const claims: { reach?: unknown } = JSON.parse(
            atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')),
        );
        return claims.reach != null;
    } catch {
        return false;
    }
};

/** Optional telemetry only; the server verifies the signed actor and scope. */
export const useAppReach = (
    src: string,
    previewToken: string,
    iframeRef: RefObject<HTMLIFrameElement | null>,
    expectedOrigin: string,
): string => {
    const createNavigation = (source: string, previousPath: string | null) => {
        const url = new URL(source, window.location.origin);
        const appPath = url.pathname.split('/t/')[0];
        if (!hasReachCapture(previewToken))
            return { source, appPath, capture: null };
        const viewId = uuidv4();
        const pageNavigation = performance.getEntriesByType?.(
            'navigation',
        )[0] as PerformanceNavigationTiming | undefined;
        const isReload =
            previousPath === appPath ||
            (pageNavigation?.type === 'reload' &&
                new URL(pageNavigation.name).pathname ===
                    window.location.pathname);
        url.searchParams.set('usageViewId', viewId);
        url.searchParams.set('usageReload', String(isReload));
        const endpoint = new URL('reach', url);
        endpoint.search = '';
        endpoint.hash = '';
        return {
            source,
            appPath,
            capture: {
                src: url.toString(),
                endpoint: endpoint.toString(),
                viewId,
            },
        };
    };
    const [current, setCurrent] = useState(() => createNavigation(src, null));
    if (current.source !== src)
        setCurrent(createNavigation(src, current.appPath));
    const navigation = current.capture;

    useEffect(() => {
        if (!navigation) return undefined;
        const recorded = new Set<string>();
        const handler = (event: MessageEvent) => {
            if (
                event.source !== iframeRef.current?.contentWindow ||
                (event.origin !== expectedOrigin && event.origin !== 'null')
            )
                return;
            const type: unknown = event.data?.type;
            const stage =
                type === 'lightdash:sdk:manifest'
                    ? 'sdk_ready'
                    : type === 'lightdash:sdk:render-error'
                      ? 'render_error'
                      : null;
            if (!stage || recorded.has(stage)) return;
            recorded.add(stage);
            void fetch(navigation.endpoint, {
                method: 'POST',
                credentials: 'omit',
                headers: { 'Content-Type': 'text/plain' },
                body: JSON.stringify({ viewId: navigation.viewId, stage }),
            }).catch(() => {});
        };
        window.addEventListener('message', handler);
        return () => window.removeEventListener('message', handler);
    }, [navigation, iframeRef, expectedOrigin]);

    return navigation?.src ?? src;
};
