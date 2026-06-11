import { FeatureFlags } from '@lightdash/common';
import { Box, Loader, Stack, Text } from '@mantine-8/core';
import { useDebouncedValue } from '@mantine-8/hooks';
import { IconAppsOff } from '@tabler/icons-react';
import { useCallback, useEffect, useState } from 'react';
import { Navigate, useParams } from 'react-router';
import ScreenshotReadyIndicator from '../components/common/ScreenshotReadyIndicator';
import SuboptimalState from '../components/common/SuboptimalState/SuboptimalState';
import ForbiddenPanel from '../components/ForbiddenPanel';
import AppIframePreview from '../features/apps/AppIframePreview';
import { useAppPreviewToken } from '../features/apps/hooks/useAppPreviewToken';
import { type QueryEvent } from '../features/apps/hooks/useAppSdkBridge';
import { useGetApp } from '../features/apps/hooks/useGetApp';
import { usePreviewOrigin } from '../features/apps/previewOrigin';
import { useServerFeatureFlag } from '../hooks/useServerOrClientFeatureFlag';

/**
 * How long the app must be quiet (SDK alive, zero in-flight queries) before
 * we consider it ready for screenshot. Apps that fire a series of queries can
 * briefly hit zero in-flight between requests; this debounce avoids signalling
 * ready in those gaps.
 */
const APP_QUIET_DEBOUNCE_MS = 1_500;

/**
 * Fallback: when the iframe has been loaded this long without the SDK
 * announcing `lightdash:sdk:screenshot-available`, treat it as alive
 * anyway. Covers apps generated before that announce shipped in the
 * template — their bundle still loads and runs queries, it just never
 * tells us. Without this fallback those scheduled deliveries would time
 * out at 60s every run.
 */
const SDK_ALIVE_FALLBACK_MS = 8_000;

/**
 * Chrome-stripped variant of AppPreviewTest used by the headless browser
 * for scheduled-delivery screenshots. Always renders the latest ready
 * version — no version pinning, consistent with chart/dashboard schedulers.
 *
 * Mounts a `ScreenshotReadyIndicator` once the iframe has loaded and all
 * SDK-bridge queries have settled — the backend `UnfurlService` waits on
 * that signal before triggering the screenshot.
 */
export default function MinimalApp() {
    const { projectUuid, appUuid } = useParams<{
        projectUuid: string;
        appUuid: string;
    }>();

    const dataAppsFlag = useServerFeatureFlag(FeatureFlags.EnableDataApps);

    const appQuery = useGetApp(projectUuid, appUuid);
    const latestReadyVersion = appQuery.data?.pages[0]?.versions.find(
        (v) => v.status === 'ready',
    )?.version;

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

    const handleIframeLoad = useCallback(() => {
        setIframeLoaded(true);
    }, []);

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

    // Start the fallback clock once the iframe load event fires. The
    // about:blank load fires first and we accept that — the fallback is
    // a long backstop, not a precise SDK-bootstrap proxy. If the SDK
    // announces before the timer fires, sdkAlive carries us; if not,
    // sdkAliveFallback kicks in for old-template apps that never announce.
    useEffect(() => {
        if (!iframeLoaded) return;
        const timer = setTimeout(
            () => setSdkAliveFallback(true),
            SDK_ALIVE_FALLBACK_MS,
        );
        return () => clearTimeout(timer);
    }, [iframeLoaded]);

    // Debounced ready signal: only true once the SDK has announced (or the
    // fallback timer has elapsed) AND in-flight query count has been zero
    // for APP_QUIET_DEBOUNCE_MS. Gating on the SDK announce — not the
    // iframe load — keeps the indicator from mounting in the window
    // between iframe HTML load and the SDK bundle bootstrapping, which
    // was the root cause of blank/mid-animation screenshots.
    const [isReady] = useDebouncedValue(
        (sdkAlive || sdkAliveFallback) && activeQueryIds.size === 0,
        APP_QUIET_DEBOUNCE_MS,
    );

    if (dataAppsFlag.isLoading) return null;
    if (!dataAppsFlag.data?.enabled) {
        return <Navigate to={`/projects/${projectUuid}/home`} replace />;
    }
    if (!projectUuid || !appUuid) {
        return <div>Missing route params</div>;
    }

    const isForbidden =
        appQuery.error?.error?.statusCode === 403 ||
        tokenError?.error?.statusCode === 403;
    if (isForbidden) {
        return <ForbiddenPanel />;
    }

    const isNotFound =
        appQuery.error?.error?.statusCode === 404 ||
        tokenError?.error?.statusCode === 404;
    if (isNotFound) {
        return (
            <Box mt="30vh">
                <SuboptimalState
                    icon={IconAppsOff}
                    title="Data app not found"
                    description="This data app doesn't exist or has been deleted."
                />
            </Box>
        );
    }

    if (!appQuery.isLoading && !appQuery.error && !latestReadyVersion) {
        return (
            <Stack align="center" justify="center" h="100vh">
                <Text c="red" size="sm">
                    No ready version found for this app
                </Text>
            </Stack>
        );
    }

    const isLoading =
        appQuery.isLoading ||
        (latestReadyVersion !== undefined && isTokenLoading);
    const error = appQuery.error ?? tokenError;

    if (isLoading) {
        return (
            <Stack align="center" justify="center" h="100vh">
                <Loader size="md" />
            </Stack>
        );
    }
    if (error) {
        return (
            <Stack align="center" justify="center" h="100vh">
                <Text c="red" size="sm">
                    Failed to load app:{' '}
                    {error instanceof Error ? error.message : 'Unknown error'}
                </Text>
            </Stack>
        );
    }

    const previewUrl = token
        ? `${previewOrigin}/api/apps/${appUuid}/versions/${latestReadyVersion}/t/${token}/#transport=postMessage&projectUuid=${projectUuid}`
        : undefined;
    if (!previewUrl) return null;

    return (
        <Box pos="relative" h="100vh" w="100%">
            <AppIframePreview
                src={previewUrl}
                expectedPreviewOrigin={previewOrigin}
                identityKey={`${appUuid}:${latestReadyVersion}`}
                onIframeLoad={handleIframeLoad}
                onQueryEvent={handleQueryEvent}
                onScreenshotAvailabilityChange={handleScreenshotAvailable}
            />
            {isReady && (
                <ScreenshotReadyIndicator
                    tilesTotal={1}
                    tilesReady={1}
                    tilesErrored={0}
                />
            )}
        </Box>
    );
}
