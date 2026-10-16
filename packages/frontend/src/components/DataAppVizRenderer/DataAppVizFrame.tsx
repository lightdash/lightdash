import {
    CUSTOM_CHART_READY_FALLBACK_ATTRIBUTE,
    LOADING_CHART_CLASS,
    type ApiError,
    type DataAppVizContext,
    type DataAppVizRenderMetadata,
    type ExternalFetchRequest,
} from '@lightdash/common';
import { Anchor, Box, Stack, Text } from '@mantine/core';
import { IconPuzzle } from '@tabler/icons-react';
import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type ComponentProps,
    type FC,
    type ReactNode,
} from 'react';
import { Link } from 'react-router';
import { v4 as uuidv4 } from 'uuid';
import AppIframePreview from '../../features/apps/AppIframePreview';
import { getVisiblePreviewTokenError } from '../../features/apps/hooks/previewTokenQueryOptions';
import { type SdkManifest } from '../../features/apps/hooks/useAppSdkBridge';
import { usePreviewOrigin } from '../../features/apps/previewOrigin';
import {
    useDataAppVizPreviewToken,
    type DataAppVizRenderTarget,
} from '../../features/chartTypes/hooks/useDataAppVizRender';
import { captureChartTypeError } from '../../features/chartTypes/utils/captureChartTypeError';
import LoadingChart from '../common/LoadingChart';
import MantineIcon from '../common/MantineIcon';
import { DefaultSkeleton } from '../DashboardTiles/TileBase/LoadingSkeletonOverlay';
import {
    FIRST_PAINT_REVEAL_FALLBACK_MS,
    RENDER_ACK_FALLBACK_MS,
    SCREENSHOT_READY_FALLBACK_MS,
} from './constants';
import classes from './DataAppVizRenderer.module.css';

type VizRenderReadinessState = {
    navigationKey: string | null;
    supportsRenderSignal: boolean;
    sdkReady: boolean;
    renderedId: string | null;
};

/** Create empty readiness state for one normalized iframe navigation. */
const createVizRenderReadinessState = (
    navigationKey: string | null,
): VizRenderReadinessState => ({
    navigationKey,
    supportsRenderSignal: false,
    sdkReady: false,
    renderedId: null,
});

// Match the built-in charts: dashboard tiles load behind the tile skeleton,
// other surfaces behind the standard loading chart.
const DataAppVizLoading: FC<{ isInDashboard: boolean }> = ({ isInDashboard }) =>
    isInDashboard ? (
        <Box h="100%" w="100%" className={LOADING_CHART_CLASS}>
            <DefaultSkeleton />
        </Box>
    ) : (
        <LoadingChart />
    );

export type DataAppVizPlaceholderHint = {
    hint: string;
    hintLink?: { label: string; to: string };
};

const DataAppVizPlaceholder: FC<
    { message: string } & Partial<DataAppVizPlaceholderHint>
> = ({ message, hint, hintLink }) => (
    <Stack align="center" justify="center" gap="xs" h="100%" w="100%">
        <MantineIcon icon={IconPuzzle} size="xl" color="ldGray.5" />
        <Text c="dimmed" size="sm" ta="center">
            {message}
        </Text>
        {hint && (
            <Text c="dimmed" size="xs" ta="center" maw={360}>
                {hint}
                {hintLink && (
                    <>
                        {' '}
                        <Anchor component={Link} to={hintLink.to} size="xs">
                            {hintLink.label}
                        </Anchor>
                    </>
                )}
            </Text>
        )}
    </Stack>
);

const getTerminalRequestErrorMessage = (
    errors: Array<ApiError | null | undefined>,
): string | undefined => {
    if (errors.some((error) => error?.error.statusCode === 403)) {
        return "You don't have access to this custom chart type.";
    }

    if (errors.some((error) => error?.error.statusCode === 404)) {
        return 'The chart type this chart was based on has been removed.';
    }

    return undefined;
};

type IframeProps = ComponentProps<typeof AppIframePreview>;

/** Host callbacks for the viz's interactive routes; omitted ⇒ the route answers with an error. */
export type DataAppVizFrameInteractions = Pick<
    IframeProps,
    | 'rewriteVizUnderlyingDataRequest'
    | 'onVizUnderlyingDataIntent'
    | 'onVizDrillDownIntent'
    | 'onVizPointMenuIntent'
    | 'onVizSubtotalsIntent'
>;

export type DataAppVizFrameProps = {
    projectUuid: string | undefined;
    dataAppVizUuid: string | null;
    renderTarget: DataAppVizRenderTarget;
    renderPinnedVersion: number | undefined;
    /** Fetched by the caller with the same target and pin, since it also reads the schema. */
    renderMetadata: DataAppVizRenderMetadata | undefined;
    renderMetadataError: ApiError | null;
    chartContext: ExternalFetchRequest['chartContext'] | undefined;
    /** Undefined until every piece of the render context is ready. */
    context: DataAppVizContext | undefined;
    /** The host's query is (re)loading. */
    isLoading: boolean;
    isInDashboard: boolean;
    onScreenshotReady: (() => void) | undefined;
    /** Tags for render error reports. */
    errorReport: {
        savedChartUuid: string | undefined;
        pinnedVersion: number | undefined;
    };
    /** Recovery hint under the "removed" placeholder; null hides it. */
    removedHint: DataAppVizPlaceholderHint | null;
    /** Copy for a built version whose bundle is gone. */
    unavailablePlaceholder: { message: string; hint?: string };
    interactions: DataAppVizFrameInteractions;
    /** Rendered over the iframe, e.g. a point menu. */
    children?: ReactNode;
};

/**
 * The custom chart type iframe: preview token, placeholders, render
 * readiness and screenshot signalling around a host-built render context.
 */
export const DataAppVizFrame: FC<DataAppVizFrameProps> = ({
    projectUuid,
    dataAppVizUuid,
    renderTarget,
    renderPinnedVersion,
    renderMetadata,
    renderMetadataError,
    chartContext,
    context,
    isLoading,
    isInDashboard,
    onScreenshotReady,
    errorReport: { savedChartUuid, pinnedVersion },
    removedHint,
    unavailablePlaceholder,
    interactions,
    children,
}) => {
    const previewOrigin = usePreviewOrigin();
    const [loadedIframeNavigationKey, setLoadedIframeNavigationKey] = useState<
        string | null
    >(null);
    const hasSignaledScreenshotReady = useRef(false);
    // Latest callback in a ref so the signal helper stays identity-stable —
    // the fallback timer must arm once, not reset on parent re-renders.
    const onScreenshotReadyRef = useRef(onScreenshotReady);
    onScreenshotReadyRef.current = onScreenshotReady;
    const signalScreenshotReady = useCallback(() => {
        if (hasSignaledScreenshotReady.current) return;
        hasSignaledScreenshotReady.current = true;
        onScreenshotReadyRef.current?.();
    }, []);

    const readyMetadata =
        renderMetadata?.state === 'ready' ? renderMetadata : undefined;
    const { data: token, error: previewTokenError } = useDataAppVizPreviewToken(
        projectUuid,
        dataAppVizUuid,
        readyMetadata?.version,
        renderTarget,
        renderPinnedVersion,
    );

    // Terminal placeholders never mount the iframe — their frame is final,
    // so report ready now instead of stalling until the fallback timeout.
    const terminalRequestErrors = [
        renderMetadataError,
        getVisiblePreviewTokenError(previewTokenError, !!token),
    ];
    // 404 is the designed "chart type removed" state with its own recovery UX.
    const reportableRenderError =
        terminalRequestErrors.find(
            (error) => error && error.error.statusCode !== 404,
        ) ?? null;
    useEffect(() => {
        if (!reportableRenderError) return;
        captureChartTypeError('chartTypeRender', reportableRenderError, {
            dataAppVizUuid,
            savedChartUuid,
            pinnedVersion,
        });
    }, [reportableRenderError, dataAppVizUuid, savedChartUuid, pinnedVersion]);
    const terminalRequestErrorMessage = getTerminalRequestErrorMessage(
        terminalRequestErrors,
    );
    const chartTypeRemoved = terminalRequestErrors.some(
        (error) => error?.error.statusCode === 404,
    );
    const isTerminalPlaceholder =
        !projectUuid ||
        dataAppVizUuid === null ||
        !!terminalRequestErrorMessage ||
        renderMetadata?.state === 'building' ||
        renderMetadata?.state === 'unavailable' ||
        renderMetadata?.state === 'failed';
    useEffect(() => {
        if (isTerminalPlaceholder) signalScreenshotReady();
    }, [isTerminalPlaceholder, signalScreenshotReady]);

    const previewUrl =
        !isTerminalPlaceholder && readyMetadata && token
            ? `${previewOrigin}/api/apps/${dataAppVizUuid}/versions/${readyMetadata.version}/t/${token}/?r=0#transport=postMessage&projectUuid=${projectUuid}`
            : null;
    // Token renewal updates the bridge without navigating the same bundle.
    const iframeNavigationKey =
        previewUrl && token
            ? previewUrl.replace(token, '{preview-token}')
            : null;
    const isPreviewLoading =
        isLoading || loadedIframeNavigationKey !== iframeNavigationKey;
    useEffect(() => {
        if (previewUrl === null) setLoadedIframeNavigationKey(null);
    }, [previewUrl]);

    const renderRequest = useMemo(
        () => ({
            id: uuidv4(),
            context,
            navigationKey: iframeNavigationKey,
        }),
        [context, iframeNavigationKey],
    );
    const [renderReadiness, setRenderReadiness] =
        useState<VizRenderReadinessState>(() =>
            createVizRenderReadinessState(iframeNavigationKey),
        );
    const activeRenderReadiness =
        renderReadiness.navigationKey === iframeNavigationKey
            ? renderReadiness
            : createVizRenderReadinessState(iframeNavigationKey);
    const { supportsRenderSignal, sdkReady, renderedId } =
        activeRenderReadiness;

    // Tag every update with the normalized navigation identity. When the
    // iframe changes, stale readiness is ignored during render rather than
    // cleared after commit by an effect. Token-only renewals keep the same key.
    const updateRenderReadiness = useCallback(
        (update: Partial<Omit<VizRenderReadinessState, 'navigationKey'>>) => {
            setRenderReadiness((current) => ({
                ...(current.navigationKey === iframeNavigationKey
                    ? current
                    : createVizRenderReadinessState(iframeNavigationKey)),
                ...update,
            }));
        },
        [iframeNavigationKey],
    );
    const handleVizContextRequest = useCallback(
        () => updateRenderReadiness({ sdkReady: true }),
        [updateRenderReadiness],
    );
    const handleScreenshotAvailabilityChange = useCallback(
        (available: boolean) => {
            if (available) updateRenderReadiness({ sdkReady: true });
        },
        [updateRenderReadiness],
    );
    const handleSdkManifest = useCallback(
        (manifest: SdkManifest) => {
            updateRenderReadiness({
                sdkReady: true,
                supportsRenderSignal:
                    manifest.features.includes('viz-rendered'),
            });
        },
        [updateRenderReadiness],
    );
    const handleVizRendered = useCallback(
        (renderId: string) => updateRenderReadiness({ renderedId: renderId }),
        [updateRenderReadiness],
    );

    // Keep the loading state up until a freshly loaded bundle paints, so the
    // blank iframe never shows. Bundles that never report are revealed later.
    const [paintFallbackKey, setPaintFallbackKey] = useState<string | null>(
        null,
    );
    const isAwaitingFirstPaint =
        iframeNavigationKey !== null &&
        paintFallbackKey !== iframeNavigationKey &&
        renderedId === null &&
        (!sdkReady || supportsRenderSignal);
    const isAwaitingIframeLoad =
        loadedIframeNavigationKey !== iframeNavigationKey;
    useEffect(() => {
        if (!isAwaitingFirstPaint || isAwaitingIframeLoad) return;
        const timer = setTimeout(
            () => setPaintFallbackKey(iframeNavigationKey),
            FIRST_PAINT_REVEAL_FALLBACK_MS,
        );
        return () => clearTimeout(timer);
    }, [isAwaitingFirstPaint, isAwaitingIframeLoad, iframeNavigationKey]);
    const isShowingLoading = isPreviewLoading || isAwaitingFirstPaint;

    useEffect(() => {
        if (
            previewUrl &&
            !isPreviewLoading &&
            context &&
            renderedId === renderRequest.id
        ) {
            signalScreenshotReady();
        }
    }, [
        previewUrl,
        isPreviewLoading,
        context,
        renderedId,
        renderRequest.id,
        signalScreenshotReady,
    ]);

    const hasVizContext = context !== undefined;
    // Set when a render-acknowledging bundle had to be released by the
    // fallback timer, so the screenshot service can report it.
    const [renderAckFallbackUsed, setRenderAckFallbackUsed] = useState(false);
    // Legacy bundles have no paint acknowledgement. Give them time after
    // the SDK, iframe and query load. Modern bundles acknowledge rendering,
    // but still get a longer fallback: the acknowledgement relies on
    // animation frames, which a browser may never run for an iframe it
    // considers hidden.
    useEffect(() => {
        if (
            !onScreenshotReadyRef.current ||
            !sdkReady ||
            !iframeNavigationKey ||
            isPreviewLoading ||
            !hasVizContext
        )
            return;
        const timer = setTimeout(
            () => {
                if (hasSignaledScreenshotReady.current) return;
                if (supportsRenderSignal) setRenderAckFallbackUsed(true);
                signalScreenshotReady();
            },
            supportsRenderSignal
                ? RENDER_ACK_FALLBACK_MS
                : SCREENSHOT_READY_FALLBACK_MS,
        );
        return () => clearTimeout(timer);
    }, [
        supportsRenderSignal,
        sdkReady,
        iframeNavigationKey,
        isPreviewLoading,
        hasVizContext,
        signalScreenshotReady,
    ]);

    if (!projectUuid || dataAppVizUuid === null) {
        return (
            <DataAppVizPlaceholder message="Pick a custom chart type to render." />
        );
    }

    if (terminalRequestErrorMessage) {
        const hint = chartTypeRemoved ? removedHint : null;
        return (
            <DataAppVizPlaceholder
                message={terminalRequestErrorMessage}
                hint={hint?.hint}
                hintLink={hint?.hintLink}
            />
        );
    }

    if (!renderMetadata) {
        return renderMetadataError ? (
            <DataAppVizPlaceholder message="Custom chart type could not be loaded." />
        ) : (
            <DataAppVizLoading isInDashboard={isInDashboard} />
        );
    }

    if (renderMetadata.state === 'building') {
        return (
            <DataAppVizPlaceholder message="Custom chart type is still generating…" />
        );
    }

    if (renderMetadata.state === 'unavailable') {
        return (
            <DataAppVizPlaceholder
                message={unavailablePlaceholder.message}
                hint={unavailablePlaceholder.hint}
            />
        );
    }

    if (renderMetadata.state === 'failed') {
        return (
            <DataAppVizPlaceholder message="Custom chart type failed to generate." />
        );
    }

    if (!token || !previewUrl) {
        return previewTokenError ? (
            <DataAppVizPlaceholder message="Custom chart type could not be loaded." />
        ) : (
            <DataAppVizLoading isInDashboard={isInDashboard} />
        );
    }

    return (
        <Box
            className={classes.previewContainer}
            {...(renderAckFallbackUsed && {
                [CUSTOM_CHART_READY_FALLBACK_ATTRIBUTE]: `${dataAppVizUuid}@${readyMetadata?.version}`,
            })}
        >
            <Box
                className={classes.previewFrame}
                inert={isShowingLoading}
                aria-hidden={isShowingLoading}
            >
                <AppIframePreview
                    key={renderRequest.navigationKey}
                    src={previewUrl}
                    previewToken={token}
                    expectedPreviewOrigin={previewOrigin}
                    projectUuid={projectUuid}
                    appUuid={dataAppVizUuid}
                    identityKey={dataAppVizUuid}
                    dataAppVizContext={renderRequest.context}
                    dataAppVizMode
                    chartContext={chartContext}
                    vizRenderId={renderRequest.id}
                    onVizContextRequest={handleVizContextRequest}
                    onScreenshotAvailabilityChange={
                        handleScreenshotAvailabilityChange
                    }
                    onVizRendered={handleVizRendered}
                    onSdkManifest={handleSdkManifest}
                    onIframeLoad={() =>
                        setLoadedIframeNavigationKey(iframeNavigationKey)
                    }
                    rewriteVizUnderlyingDataRequest={
                        interactions.rewriteVizUnderlyingDataRequest
                    }
                    onVizUnderlyingDataIntent={
                        interactions.onVizUnderlyingDataIntent
                    }
                    onVizDrillDownIntent={interactions.onVizDrillDownIntent}
                    onVizPointMenuIntent={interactions.onVizPointMenuIntent}
                    onVizSubtotalsIntent={interactions.onVizSubtotalsIntent}
                />
            </Box>
            {children}
            {isShowingLoading && (
                <Box
                    className={classes.loadingOverlay}
                    data-in-dashboard={isInDashboard}
                >
                    <DataAppVizLoading isInDashboard={isInDashboard} />
                </Box>
            )}
        </Box>
    );
};
