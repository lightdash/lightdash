import {
    type DeliveryCaptureManifest,
    type SchedulerAppState,
} from '@lightdash/common';
import { Box } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type FC,
} from 'react';
import AppIframePreview from '../AppIframePreview';
import { useAppPreviewToken } from '../hooks/useAppPreviewToken';
import { type QueryEvent } from '../hooks/useAppSdkBridge';
import { useGetApp } from '../hooks/useGetApp';
import { usePreviewOrigin } from '../previewOrigin';
import classes from './AppDeliveryPreviewCapture.module.css';
import { createDeliveryCaptureAccumulator } from './deliveryCaptureAccumulator';

/** Mirrors MinimalApp: how long the app must stay quiet before capture. */
const APP_QUIET_DEBOUNCE_MS = 1_500;

/** Mirrors MinimalApp: treat never-announcing (old-template) SDKs as alive. */
const SDK_ALIVE_FALLBACK_MS = 8_000;

/** Whole-render budget; past this the picker falls back to "no curation". */
const CAPTURE_TIMEOUT_MS = 60_000;

type Props = {
    projectUuid: string;
    appUuid: string;
    /** The to-be-saved app state; the render is seeded with it so captureKeys
     *  match what the scheduled delivery will capture. */
    appState: SchedulerAppState | null;
    onManifest: (manifest: DeliveryCaptureManifest) => void;
    onError: (message: string) => void;
};

/**
 * Boots the app's latest ready version in a hidden offscreen iframe with the
 * capture accumulator in preview mode (no cache-invalidation stamps) and
 * reports the captured query manifest once the app settles. Exactly one of
 * `onManifest`/`onError` fires, once. Readiness mirrors `MinimalApp`:
 * SDK announce (or fallback), zero in-flight queries, zero pending capture
 * entries, sustained for a quiet debounce.
 */
const AppDeliveryPreviewCapture: FC<Props> = ({
    projectUuid,
    appUuid,
    appState,
    onManifest,
    onError,
}) => {
    const accumulator = useMemo(createDeliveryCaptureAccumulator, []);

    const appQuery = useGetApp(projectUuid, appUuid);
    const latestReadyVersion =
        appQuery.data?.pages[0]?.latestReadyVersion ?? undefined;
    const {
        data: token,
        isLoading: isTokenLoading,
        error: tokenError,
    } = useAppPreviewToken(projectUuid, appUuid, latestReadyVersion);
    const previewOrigin = usePreviewOrigin();

    const [iframeLoaded, setIframeLoaded] = useState(false);
    const [sdkAlive, setSdkAlive] = useState(false);
    const [sdkAliveFallback, setSdkAliveFallback] = useState(false);
    const [activeQueryIds, setActiveQueryIds] = useState<Set<string>>(
        () => new Set(),
    );
    const [pendingCaptureCount, setPendingCaptureCount] = useState(0);

    // Latest callbacks in refs so the settle/timeout effects don't re-arm on
    // every parent render; settledRef enforces the emit-once contract.
    const settledRef = useRef(false);
    const onManifestRef = useRef(onManifest);
    onManifestRef.current = onManifest;
    const onErrorRef = useRef(onError);
    onErrorRef.current = onError;

    const emitError = useCallback((message: string) => {
        if (settledRef.current) return;
        settledRef.current = true;
        onErrorRef.current(message);
    }, []);

    useEffect(() => {
        const timer = setTimeout(
            () => emitError('The app took too long to run its queries'),
            CAPTURE_TIMEOUT_MS,
        );
        return () => clearTimeout(timer);
    }, [emitError]);

    const loadError = appQuery.error ?? tokenError;
    const hasNoReadyVersion =
        !appQuery.isLoading &&
        !appQuery.error &&
        latestReadyVersion === undefined;
    useEffect(() => {
        if (loadError) {
            emitError(loadError.error?.message ?? 'Failed to load the app');
        } else if (hasNoReadyVersion) {
            emitError('This app has no ready version');
        }
    }, [loadError, hasNoReadyVersion, emitError]);

    const handleIframeLoad = useCallback(() => {
        setIframeLoaded(true);
        accumulator.reset();
    }, [accumulator]);

    const handleScreenshotAvailable = useCallback((available: boolean) => {
        setSdkAlive(available);
    }, []);

    const handleQueryEvent = useCallback((event: QueryEvent) => {
        setActiveQueryIds((prev) => {
            const inFlight =
                event.status === 'pending' || event.status === 'running';
            if (inFlight && prev.has(event.id)) return prev;
            if (!inFlight && !prev.has(event.id)) return prev;
            const next = new Set(prev);
            if (inFlight) next.add(event.id);
            else next.delete(event.id);
            return next;
        });
    }, []);

    useEffect(() => {
        if (!iframeLoaded) return;
        const timer = setTimeout(
            () => setSdkAliveFallback(true),
            SDK_ALIVE_FALLBACK_MS,
        );
        return () => clearTimeout(timer);
    }, [iframeLoaded]);

    useEffect(
        () => accumulator.subscribe(setPendingCaptureCount),
        [accumulator],
    );

    const [isQuiet] = useDebouncedValue(
        iframeLoaded &&
            (sdkAlive || sdkAliveFallback) &&
            activeQueryIds.size === 0 &&
            pendingCaptureCount === 0,
        APP_QUIET_DEBOUNCE_MS,
    );

    useEffect(() => {
        if (!isQuiet || settledRef.current) return;
        let cancelled = false;
        void accumulator
            .getManifest()
            .then((manifest) => {
                if (cancelled || settledRef.current) return;
                settledRef.current = true;
                onManifestRef.current(manifest);
            })
            .catch(() => {
                if (cancelled) return;
                emitError('Failed to read the captured queries');
            });
        return () => {
            cancelled = true;
        };
    }, [isQuiet, accumulator, emitError]);

    if (latestReadyVersion === undefined || isTokenLoading || !token) {
        return null;
    }

    const stateParam =
        appState && Object.keys(appState).length > 0
            ? `&state=${encodeURIComponent(JSON.stringify(appState))}`
            : '';
    const previewUrl = `${previewOrigin}/api/apps/${appUuid}/versions/${latestReadyVersion}/t/${token}/#transport=postMessage&projectUuid=${projectUuid}${stateParam}`;

    return (
        <Box className={classes.offscreen} aria-hidden="true">
            <AppIframePreview
                src={previewUrl}
                expectedPreviewOrigin={previewOrigin}
                projectUuid={projectUuid}
                appUuid={appUuid}
                identityKey={`${appUuid}:${latestReadyVersion}`}
                onIframeLoad={handleIframeLoad}
                onQueryEvent={handleQueryEvent}
                onScreenshotAvailabilityChange={handleScreenshotAvailable}
                deliveryCapture={accumulator}
            />
        </Box>
    );
};

export default AppDeliveryPreviewCapture;
