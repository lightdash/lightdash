import { useCallback, useEffect, useState, type ComponentProps } from 'react';
import AppIframePreview from '../../features/apps/AppIframePreview';
import { createDeliveryCaptureAccumulator } from '../../features/apps/deliveryCapture/deliveryCaptureAccumulator';
import {
    type ExternalRequestEvent,
    type QueryEvent,
} from '../../features/apps/hooks/useAppSdkBridge';
import useDashboardTileStatusContext from '../../providers/Dashboard/useDashboardTileStatusContext';

const APP_QUIET_DEBOUNCE_MS = 1_500;
const SDK_ALIVE_FALLBACK_MS = 8_000;

type Props = ComponentProps<typeof AppIframePreview> & { tileUuid: string };

const DashboardDataAppIframe = ({ tileUuid, ...props }: Props) => {
    const markReady = useDashboardTileStatusContext(
        (context) => context.markTileScreenshotReady,
    );
    const markLoading = useDashboardTileStatusContext(
        (context) => context.markTileScreenshotLoading,
    );
    const [deliveryCapture] = useState(createDeliveryCaptureAccumulator);
    const [pendingQueries, setPendingQueries] = useState(0);
    const [activeRequests, setActiveRequests] = useState<Set<string>>(
        () => new Set(),
    );
    const [sdkAlive, setSdkAlive] = useState(false);
    const [sdkAliveFallback, setSdkAliveFallback] = useState(false);
    const [loadEpoch, setLoadEpoch] = useState(0);

    useEffect(
        () => deliveryCapture.subscribe(setPendingQueries),
        [deliveryCapture],
    );

    const handleRequest = useCallback(
        (event: QueryEvent | ExternalRequestEvent) => {
            const pending =
                event.status === 'pending' || event.status === 'running';
            setActiveRequests((current) => {
                if (current.has(event.id) === pending) {
                    return current;
                }
                const next = new Set(current);
                if (pending) {
                    next.add(event.id);
                } else {
                    next.delete(event.id);
                }
                return next;
            });
        },
        [],
    );

    const handleLoad = useCallback(() => {
        setLoadEpoch((epoch) => epoch + 1);
    }, []);

    useEffect(() => {
        if (loadEpoch === 0) {
            return;
        }
        // Older app bundles don't announce SDK availability.
        const timer = setTimeout(
            () => setSdkAliveFallback(true),
            SDK_ALIVE_FALLBACK_MS,
        );
        return () => clearTimeout(timer);
    }, [loadEpoch]);

    useEffect(() => {
        markLoading(tileUuid);
        if (
            loadEpoch === 0 ||
            !(sdkAlive || sdkAliveFallback) ||
            pendingQueries > 0 ||
            activeRequests.size > 0
        ) {
            return;
        }
        const timer = setTimeout(
            () => markReady(tileUuid),
            APP_QUIET_DEBOUNCE_MS,
        );
        return () => clearTimeout(timer);
    }, [
        tileUuid,
        markLoading,
        markReady,
        loadEpoch,
        sdkAlive,
        sdkAliveFallback,
        pendingQueries,
        activeRequests,
    ]);

    useEffect(() => () => markLoading(tileUuid), [markLoading, tileUuid]);

    return (
        <AppIframePreview
            {...props}
            deliveryCapture={deliveryCapture}
            onIframeLoad={handleLoad}
            onQueryEvent={handleRequest}
            onExternalRequestEvent={handleRequest}
            onScreenshotAvailabilityChange={setSdkAlive}
        />
    );
};

export default DashboardDataAppIframe;
