import {
    ChartType,
    getEffectiveOptionValues,
    hasCustomBinDimension,
    type ApiError,
    type DataAppVizContext,
    type ItemsMap,
    type ResultRow,
} from '@lightdash/common';
import { Anchor, Box, Stack, Text } from '@mantine/core';
import { IconPuzzle } from '@tabler/icons-react';
import isEqual from 'lodash/isEqual';
import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type FC,
} from 'react';
import { Link } from 'react-router';
import useEmbed from '../../ee/providers/Embed/useEmbed';
import AppIframePreview from '../../features/apps/AppIframePreview';
import { useChartVersionPreview } from '../../features/apps/ChartVersionPreview/useChartVersionPreview';
import { getVisiblePreviewTokenError } from '../../features/apps/hooks/previewTokenQueryOptions';
import { usePreviewOrigin } from '../../features/apps/previewOrigin';
import {
    useDataAppVizPreviewToken,
    useDataAppVizRenderMetadata,
} from '../../features/chartTypes/hooks/useDataAppVizRender';
import { useDataAppVizResolvedColors } from '../../features/chartTypes/hooks/useDataAppVizResolvedColors';
import { reconcileDataAppVizFieldMapping } from '../../features/chartTypes/utils/autoMapDataAppVizFields';
import useToaster from '../../hooks/toaster/useToaster';
import { useContextMenuPermissions } from '../../hooks/useContextMenuPermissions';
import { useExplore } from '../../hooks/useExplore';
import { useProjectUuid } from '../../hooks/useProjectUuid';
import useApp from '../../providers/App/useApp';
import useTracking from '../../providers/Tracking/useTracking';
import { EventName } from '../../types/Events';
import LoadingChart from '../common/LoadingChart';
import MantineIcon from '../common/MantineIcon';
import { isDataAppVizVisualizationConfig } from '../LightdashVisualization/types';
import { useVisualizationContext } from '../LightdashVisualization/useVisualizationContext';
import { useMetricQueryDataContext } from '../MetricQueryData/useMetricQueryDataContext';
import {
    LEGACY_VIZ_MANIFEST_TIMEOUT_MS,
    SCREENSHOT_READY_FALLBACK_MS,
} from './constants';
import classes from './DataAppVizRenderer.module.css';
import { resolveVizDrillDownConfig } from './vizDrillDownConfig';
import { resolveVizUnderlyingDataConfig } from './vizUnderlyingDataConfig';
import { buildVizUnderlyingDataRequest } from './vizUnderlyingDataRequest';

type Props = {
    onScreenshotReady?: () => void;
    onScreenshotError?: () => void;
};

const DataAppVizPlaceholder: FC<{
    message: string;
    hint?: string;
    hintLink?: { label: string; to: string };
}> = ({ message, hint, hintLink }) => (
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

const EMPTY_ITEMS_MAP: ItemsMap = {};
const EMPTY_ROWS: ResultRow[] = [];
const EMPTY_FIELD_MAPPING = {};

type VizRenderSignalSupport = 'unknown' | 'current' | 'legacy';

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

const DataAppVizRenderer: FC<Props> = ({ onScreenshotReady }) => {
    const projectUuid = useProjectUuid();
    const {
        visualizationConfig,
        resultsData,
        colorPalette,
        itemsMap,
        savedChartUuid,
        savedChartReference,
        minimal,
        parameters,
        dateZoom,
        resolvedTimezone,
        isEditMode,
        isLoading,
    } = useVisualizationContext();
    const { embedToken } = useEmbed();
    const { canViewUnderlyingData, canDrillInto } = useContextMenuPermissions();
    const previewOrigin = usePreviewOrigin();
    const { user, health } = useApp();
    const [loadedIframeNavigationKey, setLoadedIframeNavigationKey] = useState<
        string | null
    >(null);
    // Fail-silent: /minimal routes at desktop viewports mount no
    // TrackingProvider (App.tsx `enabled={isMobile || !isMinimalPage}`), so
    // screenshot/export/unfurl renders simply skip the drill-by event.
    const trackingContext = useTracking({ failSilently: true });
    const hasSignaledScreenshotReady = useRef(false);
    const renderIdRef = useRef({
        context: undefined as DataAppVizContext | undefined,
        navigationKey: null as string | null,
        sequence: 0,
        id: undefined as string | undefined,
    });
    // Latest callback in a ref so the signal helper stays identity-stable —
    // the fallback timer must arm once, not reset on parent re-renders.
    const onScreenshotReadyRef = useRef(onScreenshotReady);
    onScreenshotReadyRef.current = onScreenshotReady;
    const signalScreenshotReady = useCallback(() => {
        if (hasSignaledScreenshotReady.current) return;
        hasSignaledScreenshotReady.current = true;
        onScreenshotReadyRef.current?.();
    }, []);

    // The iframe SDK posts `lightdash:sdk:screenshot-available` at bundle
    // boot — proof the sandbox is alive, not that the viz painted.
    const [vizRenderSignalSupport, setVizRenderSignalSupport] =
        useState<VizRenderSignalSupport>('unknown');
    const [renderedContextId, setRenderedContextId] = useState<string | null>(
        null,
    );
    const legacyFallbackRef = useRef<{
        navigationKey: string | null;
        deadline: number;
    } | null>(null);

    // Fetch every page so the renderer gets all rows — surfaces that don't
    // auto-fetch (dashboard tiles) would otherwise push a partial result.
    useEffect(() => {
        resultsData?.setFetchAll(true);
    }, [resultsData]);

    const dataAppVizChartConfig = isDataAppVizVisualizationConfig(
        visualizationConfig,
    )
        ? visualizationConfig.chartConfig
        : null;
    const config = dataAppVizChartConfig?.validConfig ?? null;
    const dataAppVizUuid = config?.dataAppVizUuid ?? null;
    const fieldMapping = config?.fieldMapping;
    const optionValues = config?.optionValues;
    const rows = resultsData?.rows;
    const pivotDetails = resultsData?.pivotDetails ?? null;

    const chartVersionUuid = useChartVersionPreview();
    const savedDataAppVizConfig =
        savedChartReference?.chartConfig.type === ChartType.DATA_APP_VIZ
            ? savedChartReference.chartConfig.config
            : undefined;
    const matchesSavedBinding =
        config?.dataAppVizUuid === savedDataAppVizConfig?.dataAppVizUuid &&
        config?.dataAppVizVersion === savedDataAppVizConfig?.dataAppVizVersion;
    const renderSavedChartUuid = chartVersionUuid
        ? (savedChartReference?.uuid ?? savedChartUuid)
        : (savedChartUuid ??
          (isEditMode && matchesSavedBinding
              ? savedChartReference?.uuid
              : undefined));
    const renderTarget = useMemo(
        () => ({
            isEmbedded: !!embedToken,
            savedChartUuid: renderSavedChartUuid,
            chartVersionUuid,
        }),
        [embedToken, renderSavedChartUuid, chartVersionUuid],
    );
    const renderPinnedVersion = renderSavedChartUuid
        ? config?.dataAppVizVersion
        : undefined;
    const { data: renderMetadata, error: renderMetadataError } =
        useDataAppVizRenderMetadata(
            projectUuid,
            dataAppVizUuid,
            renderTarget,
            renderPinnedVersion,
        );
    const readyMetadata =
        renderMetadata?.state === 'ready' ? renderMetadata : undefined;
    useEffect(() => {
        if (
            !isEditMode ||
            !readyMetadata ||
            !dataAppVizChartConfig ||
            !config ||
            (config.dataAppVizVersion !== undefined &&
                renderSavedChartUuid !== undefined) ||
            config.dataAppVizVersion === readyMetadata.version
        ) {
            return;
        }
        dataAppVizChartConfig.setDataAppVizVersion(readyMetadata.version);
    }, [
        config,
        isEditMode,
        readyMetadata,
        renderSavedChartUuid,
        dataAppVizChartConfig,
    ]);
    const { data: token, error: previewTokenError } = useDataAppVizPreviewToken(
        projectUuid,
        dataAppVizUuid,
        readyMetadata?.version,
        renderTarget,
        renderPinnedVersion,
    );
    const configOptions = readyMetadata?.schema.configOptions;
    const fields = readyMetadata?.schema.fields;

    const metricQuery = resultsData?.metricQuery;
    const sourceQueryUuid = resultsData?.queryUuid;

    // Explore-independent gating, mirroring regular chart context menus: no
    // query (builder canvas/sample previews), no permission, custom bin
    // dimensions, embeds (GLITCH-592) and screenshot renders all disable
    // underlying data.
    const underlyingDataPreconditions =
        !!sourceQueryUuid &&
        !!metricQuery &&
        canViewUnderlyingData &&
        !hasCustomBinDimension(metricQuery) &&
        !embedToken &&
        !minimal &&
        !pivotDetails;

    const { data: explore } = useExplore(metricQuery?.exploreName, {
        refetchOnMount: false,
        // Passing `enabled` overrides useExplore's own guards — keep them.
        enabled:
            underlyingDataPreconditions &&
            !!metricQuery?.exploreName &&
            !!projectUuid,
    });

    // Reconciled against the contract and columns in force now, so a rebuilt
    // viz never renders through a binding the panel no longer shows. Shared by
    // the context push and the rewrite callback, so clicks resolve through
    // exactly what the iframe was told.
    const reconciledFieldMapping = useMemo(
        () =>
            fields
                ? reconcileDataAppVizFieldMapping(
                      fields,
                      itemsMap ?? {},
                      fieldMapping ?? {},
                  )
                : undefined,
        [fields, itemsMap, fieldMapping],
    );
    const resolvedColors = useDataAppVizResolvedColors({
        itemsMap: itemsMap ?? EMPTY_ITEMS_MAP,
        rows: rows ?? EMPTY_ROWS,
        fieldMapping: reconciledFieldMapping ?? EMPTY_FIELD_MAPPING,
        pivotDetails,
        colorPalette,
    });

    // Fail-silent: surfaces without MetricQueryDataProvider (no drill modal
    // mounted) simply report drill-down as unavailable.
    const metricQueryData = useMetricQueryDataContext(true);
    const openDrillDownModal = metricQueryData?.openDrillDownModal;
    const openUnderlyingDataModal = metricQueryData?.openUnderlyingDataModal;
    const { showToastError } = useToaster();

    // Same shape as underlyingDataPreconditions plus the drill permission and
    // dialog; no explore fetch needed — DrillDownModal reads it from its provider.
    const drillDownEnabled =
        !!sourceQueryUuid &&
        !!metricQuery &&
        canDrillInto &&
        !hasCustomBinDimension(metricQuery) &&
        !embedToken &&
        !minimal &&
        !pivotDetails &&
        !!openDrillDownModal &&
        !!reconciledFieldMapping;

    // undefined ⇒ the bridge answers the virtual route with an error —
    // enforcement is structural, matching the underlying-data rewrite.
    const onVizDrillDownIntent = useMemo(() => {
        if (!drillDownEnabled || !openDrillDownModal || !reconciledFieldMapping)
            return undefined;
        return (intentBody: unknown) => {
            try {
                openDrillDownModal(
                    resolveVizDrillDownConfig(intentBody, {
                        fieldMapping: reconciledFieldMapping,
                        itemsMap: itemsMap ?? {},
                    }),
                );
                trackingContext?.track({
                    name: EventName.DRILL_BY_CLICKED,
                    properties: {
                        organizationId: user?.data?.organizationUuid,
                        userId: user?.data?.userUuid,
                        projectId: projectUuid,
                    },
                });
            } catch (err) {
                showToastError({
                    title: 'Could not drill into this data point',
                    subtitle: err instanceof Error ? err.message : undefined,
                });
                throw err; // bridge relays the message as the route's error response
            }
        };
    }, [
        drillDownEnabled,
        openDrillDownModal,
        reconciledFieldMapping,
        itemsMap,
        showToastError,
        trackingContext,
        user,
        projectUuid,
    ]);

    const underlyingDataEnabled =
        underlyingDataPreconditions && !!explore && !!reconciledFieldMapping;
    const underlyingDataOpenEnabled =
        underlyingDataEnabled && !!openUnderlyingDataModal;

    const onVizUnderlyingDataIntent = useMemo(() => {
        if (
            !underlyingDataOpenEnabled ||
            !openUnderlyingDataModal ||
            !reconciledFieldMapping
        ) {
            return undefined;
        }
        return (intentBody: unknown) => {
            try {
                openUnderlyingDataModal(
                    resolveVizUnderlyingDataConfig(intentBody, {
                        fieldMapping: reconciledFieldMapping,
                        itemsMap: itemsMap ?? {},
                        dateZoom,
                    }),
                );
                trackingContext?.track({
                    name: EventName.VIEW_UNDERLYING_DATA_CLICKED,
                    properties: {
                        organizationId: user?.data?.organizationUuid,
                        userId: user?.data?.userUuid,
                        projectId: projectUuid,
                    },
                });
            } catch (err) {
                showToastError({
                    title: 'Could not open underlying data',
                    subtitle: err instanceof Error ? err.message : undefined,
                });
                throw err;
            }
        };
    }, [
        underlyingDataOpenEnabled,
        openUnderlyingDataModal,
        reconciledFieldMapping,
        itemsMap,
        dateZoom,
        trackingContext,
        user,
        projectUuid,
        showToastError,
    ]);

    // enabled:false ⇒ callback undefined ⇒ the bridge answers the virtual
    // route with an error — enforcement is structural, not menu-side.
    const rewriteVizUnderlyingDataRequest = useMemo(() => {
        if (
            !underlyingDataEnabled ||
            !projectUuid ||
            !sourceQueryUuid ||
            !metricQuery ||
            !explore ||
            !reconciledFieldMapping
        ) {
            return undefined;
        }
        return (intentBody: unknown) =>
            buildVizUnderlyingDataRequest(intentBody, {
                projectUuid,
                queryUuid: sourceQueryUuid,
                fieldMapping: reconciledFieldMapping,
                itemsMap: itemsMap ?? {},
                metricQuery,
                explore,
                resolvedTimezone,
                parameters,
                dateZoom,
            });
    }, [
        underlyingDataEnabled,
        projectUuid,
        sourceQueryUuid,
        metricQuery,
        explore,
        reconciledFieldMapping,
        itemsMap,
        resolvedTimezone,
        parameters,
        dateZoom,
    ]);

    const dataAppVizContext = useMemo<DataAppVizContext | undefined>(() => {
        if (!rows || !configOptions || !reconciledFieldMapping)
            return undefined;
        return {
            fieldMapping: reconciledFieldMapping,
            rows,
            options: getEffectiveOptionValues(
                configOptions,
                optionValues ?? {},
            ),
            // Already resolved through the full palette cascade and dark-mode
            // corrected by the visualization context.
            colorPalette,
            ...resolvedColors,
            pivotDetails,
            underlyingData: {
                enabled: underlyingDataEnabled,
                openEnabled: underlyingDataOpenEnabled,
            },
            drillDown: { enabled: drillDownEnabled },
        };
    }, [
        reconciledFieldMapping,
        rows,
        configOptions,
        optionValues,
        colorPalette,
        resolvedColors,
        pivotDetails,
        underlyingDataEnabled,
        underlyingDataOpenEnabled,
        drillDownEnabled,
    ]);

    // Terminal placeholders never mount the iframe — their frame is final,
    // so report ready now instead of stalling until the fallback timeout.
    const terminalRequestErrors = [
        renderMetadataError,
        getVisiblePreviewTokenError(previewTokenError, !!token),
    ];
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
        (!renderMetadata && !!renderMetadataError) ||
        (!!readyMetadata && !token && !!previewTokenError) ||
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
    // `useDataAppVizResolvedColors` can allocate equivalent maps while other
    // host state updates. Render ids must track a changed payload, not that
    // incidental object identity, or an acknowledgement can never catch up.
    // A referential equality check keeps the common case constant-time; the
    // deep comparison runs only for a newly allocated context.
    if (
        !isEqual(renderIdRef.current.context, dataAppVizContext) ||
        renderIdRef.current.navigationKey !== iframeNavigationKey
    ) {
        renderIdRef.current = {
            context: dataAppVizContext,
            navigationKey: iframeNavigationKey,
            sequence: renderIdRef.current.sequence + 1,
            id: dataAppVizContext
                ? `viz-render-${renderIdRef.current.sequence + 1}`
                : undefined,
        };
    }
    const dataAppVizRenderId = renderIdRef.current.id;
    const isPreviewLoading =
        isLoading || loadedIframeNavigationKey !== iframeNavigationKey;
    useEffect(() => {
        if (previewUrl === null) setLoadedIframeNavigationKey(null);
    }, [previewUrl]);

    // Every iframe navigation is a new bundle. Never let a manifest or paint
    // acknowledgement from its predecessor satisfy this render.
    useEffect(() => {
        setVizRenderSignalSupport('unknown');
        setRenderedContextId(null);
    }, [iframeNavigationKey]);

    // Only a bundle that remains silent after its bootstrap window is legacy.
    // A current bundle must prove `viz-rendered` through its manifest.
    useEffect(() => {
        if (!iframeNavigationKey || isPreviewLoading) return undefined;
        const timer = setTimeout(() => {
            setVizRenderSignalSupport((support) =>
                support === 'unknown' ? 'legacy' : support,
            );
        }, LEGACY_VIZ_MANIFEST_TIMEOUT_MS);
        return () => clearTimeout(timer);
    }, [iframeNavigationKey, isPreviewLoading]);

    // The fallback has one deadline per loaded bundle. Do not restart it for
    // a manifest, a context refresh, or a parent callback identity change.
    useEffect(() => {
        if (
            !iframeNavigationKey ||
            isPreviewLoading ||
            legacyFallbackRef.current?.navigationKey === iframeNavigationKey
        ) {
            return;
        }
        legacyFallbackRef.current = {
            navigationKey: iframeNavigationKey,
            deadline: Date.now() + SCREENSHOT_READY_FALLBACK_MS,
        };
    }, [iframeNavigationKey, isPreviewLoading]);

    const handleSdkManifest = useCallback(
        (manifest: { features: string[] }) => {
            setVizRenderSignalSupport(
                manifest.features.includes('viz-rendered')
                    ? 'current'
                    : 'legacy',
            );
        },
        [],
    );

    const handleVizRendered = useCallback((renderId: string) => {
        if (renderId !== renderIdRef.current.id) return;
        setRenderedContextId(renderId);
    }, []);

    useEffect(() => {
        if (
            previewUrl &&
            !isPreviewLoading &&
            vizRenderSignalSupport === 'current' &&
            renderedContextId === dataAppVizRenderId
        ) {
            signalScreenshotReady();
        }
    }, [
        previewUrl,
        isPreviewLoading,
        dataAppVizRenderId,
        renderedContextId,
        signalScreenshotReady,
        vizRenderSignalSupport,
    ]);

    // The fallback is strictly for legacy bundles. A current bundle has a
    // manifest and must acknowledge the matching post-paint render instead.
    useEffect(() => {
        if (
            !onScreenshotReadyRef.current ||
            vizRenderSignalSupport !== 'legacy' ||
            !legacyFallbackRef.current
        ) {
            return undefined;
        }
        const delay = Math.max(
            0,
            legacyFallbackRef.current.deadline - Date.now(),
        );
        const timer = setTimeout(signalScreenshotReady, delay);
        return () => clearTimeout(timer);
    }, [
        signalScreenshotReady,
        vizRenderSignalSupport,
        iframeNavigationKey,
        isPreviewLoading,
    ]);

    if (!projectUuid || dataAppVizUuid === null) {
        return (
            <DataAppVizPlaceholder message="Pick a custom chart type to render." />
        );
    }

    if (terminalRequestErrorMessage) {
        // Embed viewers and headless captures can't act on the removal, so
        // the recovery hint only shows in-app.
        const canRecover = chartTypeRemoved && !embedToken && !minimal;
        const recoveryAction = isEditMode
            ? 'Open Configure and choose another chart type'
            : 'Edit the chart to choose another chart type';
        const recoveryHint = health.data?.softDelete.enabled
            ? `${recoveryAction}, or restore the chart type from Recently deleted.`
            : `${recoveryAction}.`;
        // Lands in edit mode with the config sidebar already open.
        const editLink =
            canRecover && !isEditMode && savedChartUuid
                ? {
                      label: 'Edit chart',
                      to: `/projects/${projectUuid}/saved/${savedChartUuid}/edit?openVizConfig=true`,
                  }
                : undefined;
        return (
            <DataAppVizPlaceholder
                message={terminalRequestErrorMessage}
                hint={canRecover ? recoveryHint : undefined}
                hintLink={editLink}
            />
        );
    }

    if (!renderMetadata) {
        return renderMetadataError ? (
            <DataAppVizPlaceholder message="Custom chart type could not be loaded." />
        ) : (
            <LoadingChart />
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
                message={
                    renderSavedChartUuid &&
                    config?.dataAppVizVersion !== undefined
                        ? 'The saved custom chart type version is unavailable.'
                        : 'Custom chart type preview is unavailable.'
                }
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
            <LoadingChart />
        );
    }

    return (
        <Box className={classes.previewContainer}>
            <Box
                className={classes.previewFrame}
                inert={isPreviewLoading}
                aria-hidden={isPreviewLoading}
            >
                <AppIframePreview
                    src={previewUrl}
                    previewToken={token}
                    expectedPreviewOrigin={previewOrigin}
                    projectUuid={projectUuid}
                    appUuid={dataAppVizUuid}
                    identityKey={dataAppVizUuid}
                    dataAppVizContext={dataAppVizContext}
                    dataAppVizRenderId={dataAppVizRenderId}
                    onSdkManifest={handleSdkManifest}
                    onVizRendered={handleVizRendered}
                    onIframeLoad={() =>
                        setLoadedIframeNavigationKey(iframeNavigationKey)
                    }
                    rewriteVizUnderlyingDataRequest={
                        rewriteVizUnderlyingDataRequest
                    }
                    onVizUnderlyingDataIntent={onVizUnderlyingDataIntent}
                    onVizDrillDownIntent={onVizDrillDownIntent}
                />
            </Box>
            {isPreviewLoading && (
                <Box className={classes.loadingOverlay}>
                    <LoadingChart />
                </Box>
            )}
        </Box>
    );
};

export default DataAppVizRenderer;
