import {
    ChartType,
    deriveDataAppVizFieldMetadata,
    getEffectiveOptionValues,
    hasCustomBinDimension,
    type ApiError,
    type DataAppVizContext,
    type ItemsMap,
    type ResultRow,
} from '@lightdash/common';
import { Anchor, Box, Stack, Text } from '@mantine/core';
import { IconPuzzle } from '@tabler/icons-react';
import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type FC,
} from 'react';
import { Link, useLocation } from 'react-router';
import { v4 as uuidv4 } from 'uuid';
import useEmbed from '../../ee/providers/Embed/useEmbed';
import AppIframePreview from '../../features/apps/AppIframePreview';
import { useChartVersionPreview } from '../../features/apps/ChartVersionPreview/useChartVersionPreview';
import { getVisiblePreviewTokenError } from '../../features/apps/hooks/previewTokenQueryOptions';
import { type SdkManifest } from '../../features/apps/hooks/useAppSdkBridge';
import { usePreviewOrigin } from '../../features/apps/previewOrigin';
import {
    useDataAppVizPreviewToken,
    useDataAppVizRenderMetadata,
} from '../../features/chartTypes/hooks/useDataAppVizRender';
import { useDataAppVizResolvedColors } from '../../features/chartTypes/hooks/useDataAppVizResolvedColors';
import { reconcileDataAppVizFieldMapping } from '../../features/chartTypes/utils/autoMapDataAppVizFields';
import { captureChartTypeError } from '../../features/chartTypes/utils/captureChartTypeError';
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
import { SCREENSHOT_READY_FALLBACK_MS } from './constants';
import DataAppVizPointMenu from './DataAppVizPointMenu';
import classes from './DataAppVizRenderer.module.css';
import { resolveVizDrillDownConfig } from './vizDrillDownConfig';
import {
    resolveVizPointMenuState,
    type VizPointMenuState,
} from './vizPointMenuConfig';
import { resolveVizUnderlyingDataConfig } from './vizUnderlyingDataConfig';
import { buildVizUnderlyingDataRequest } from './vizUnderlyingDataRequest';

type Props = {
    onScreenshotReady?: () => void;
    onScreenshotError?: () => void;
};

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
    // Latest callback in a ref so the signal helper stays identity-stable —
    // the fallback timer must arm once, not reset on parent re-renders.
    const onScreenshotReadyRef = useRef(onScreenshotReady);
    onScreenshotReadyRef.current = onScreenshotReady;
    const signalScreenshotReady = useCallback(() => {
        if (hasSignaledScreenshotReady.current) return;
        hasSignaledScreenshotReady.current = true;
        onScreenshotReadyRef.current?.();
    }, []);

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
    // Embedded previews retain their recorded version; Chart Studio's
    // chart-less edit canvas previews the latest generated version.
    const renderPinnedVersion =
        embedToken || renderSavedChartUuid || !isEditMode
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
                (!!embedToken || renderSavedChartUuid !== undefined)) ||
            config.dataAppVizVersion === readyMetadata.version
        ) {
            return;
        }
        dataAppVizChartConfig.setDataAppVizVersion(readyMetadata.version);
    }, [
        config,
        embedToken,
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

    // Resolves the click intent and opens the native dialog; toasts and
    // rethrows so the bridge route relays the message.
    const openVizUnderlyingData = useCallback(
        (intentBody: unknown) => {
            if (!openUnderlyingDataModal || !reconciledFieldMapping) return;
            try {
                openUnderlyingDataModal(
                    resolveVizUnderlyingDataConfig(intentBody, {
                        fieldMapping: reconciledFieldMapping,
                        itemsMap: itemsMap ?? {},
                        dateZoom,
                    }),
                );
            } catch (err) {
                showToastError({
                    title: 'Could not open underlying data',
                    subtitle: err instanceof Error ? err.message : undefined,
                });
                throw err;
            }
        },
        [
            openUnderlyingDataModal,
            reconciledFieldMapping,
            itemsMap,
            dateZoom,
            showToastError,
        ],
    );

    const onVizUnderlyingDataIntent = useMemo(() => {
        if (!underlyingDataOpenEnabled) return undefined;
        return (intentBody: unknown) => {
            openVizUnderlyingData(intentBody);
            trackingContext?.track({
                name: EventName.VIEW_UNDERLYING_DATA_CLICKED,
                properties: {
                    organizationId: user?.data?.organizationUuid,
                    userId: user?.data?.userUuid,
                    projectId: projectUuid,
                },
            });
        };
    }, [
        underlyingDataOpenEnabled,
        openVizUnderlyingData,
        trackingContext,
        user,
        projectUuid,
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

    const [pointMenuState, setPointMenuState] =
        useState<VizPointMenuState | null>(null);
    const isDashboardSurface = useLocation().pathname.includes('/dashboards');

    // Any single action available ⇒ the menu is worth offering.
    const pointMenuEnabled =
        !!reconciledFieldMapping &&
        !embedToken &&
        !minimal &&
        (underlyingDataOpenEnabled || drillDownEnabled || !!sourceQueryUuid);

    const onVizPointMenuIntent = useMemo(() => {
        if (!pointMenuEnabled || !reconciledFieldMapping) return undefined;
        return (
            intentBody: unknown,
            iframeRect: DOMRect | null,
        ): { shown: boolean } => {
            const state = resolveVizPointMenuState(intentBody, {
                fieldMapping: reconciledFieldMapping,
                itemsMap: itemsMap ?? {},
                iframeRect,
                drillDownEnabled,
                underlyingDataEnabled: underlyingDataOpenEnabled,
                dateZoom,
            });
            const hasAction =
                state.copyValue !== undefined ||
                state.underlyingDataConfig !== undefined ||
                state.drillConfig !== undefined ||
                (isDashboardSurface && state.filters.length > 0);
            if (!hasAction) return { shown: false };
            setPointMenuState(state);
            return { shown: true };
        };
    }, [
        pointMenuEnabled,
        reconciledFieldMapping,
        itemsMap,
        drillDownEnabled,
        underlyingDataOpenEnabled,
        dateZoom,
        isDashboardSurface,
    ]);

    const dataAppVizContext = useMemo<DataAppVizContext | undefined>(() => {
        if (!rows || !configOptions || !reconciledFieldMapping)
            return undefined;
        return {
            fieldMapping: reconciledFieldMapping,
            fields: deriveDataAppVizFieldMetadata(
                reconciledFieldMapping,
                itemsMap ?? {},
            ),
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
            pointMenu: { enabled: pointMenuEnabled },
        };
    }, [
        reconciledFieldMapping,
        itemsMap,
        rows,
        configOptions,
        optionValues,
        colorPalette,
        resolvedColors,
        pivotDetails,
        underlyingDataEnabled,
        underlyingDataOpenEnabled,
        drillDownEnabled,
        pointMenuEnabled,
    ]);

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
            pinnedVersion: config?.dataAppVizVersion,
        });
    }, [
        reportableRenderError,
        dataAppVizUuid,
        savedChartUuid,
        config?.dataAppVizVersion,
    ]);
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
            context: dataAppVizContext,
            navigationKey: iframeNavigationKey,
        }),
        [dataAppVizContext, iframeNavigationKey],
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

    useEffect(() => {
        if (
            previewUrl &&
            !isPreviewLoading &&
            dataAppVizContext &&
            renderedId === renderRequest.id
        ) {
            signalScreenshotReady();
        }
    }, [
        previewUrl,
        isPreviewLoading,
        dataAppVizContext,
        renderedId,
        renderRequest.id,
        signalScreenshotReady,
    ]);

    const hasVizContext = dataAppVizContext !== undefined;
    // Legacy bundles have no paint acknowledgement. Give them time after
    // the SDK, iframe and query load; modern bundles must acknowledge rendering.
    useEffect(() => {
        if (
            !onScreenshotReadyRef.current ||
            supportsRenderSignal ||
            !sdkReady ||
            !iframeNavigationKey ||
            isPreviewLoading ||
            !hasVizContext
        )
            return;
        const timer = setTimeout(
            signalScreenshotReady,
            SCREENSHOT_READY_FALLBACK_MS,
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
        const pinnedChartlessArtifact =
            !renderSavedChartUuid &&
            !isEditMode &&
            renderPinnedVersion !== undefined;
        return (
            <DataAppVizPlaceholder
                message={
                    pinnedChartlessArtifact
                        ? `Custom chart type version ${renderPinnedVersion} is unavailable.`
                        : renderSavedChartUuid &&
                            config?.dataAppVizVersion !== undefined
                          ? 'The saved custom chart type version is unavailable.'
                          : 'Custom chart type preview is unavailable.'
                }
                hint={
                    pinnedChartlessArtifact
                        ? 'Regenerate the chart to use a renderable version.'
                        : undefined
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
                    key={renderRequest.navigationKey}
                    src={previewUrl}
                    previewToken={token}
                    expectedPreviewOrigin={previewOrigin}
                    projectUuid={projectUuid}
                    appUuid={dataAppVizUuid}
                    identityKey={dataAppVizUuid}
                    dataAppVizContext={renderRequest.context}
                    dataAppVizMode
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
                        rewriteVizUnderlyingDataRequest
                    }
                    onVizUnderlyingDataIntent={onVizUnderlyingDataIntent}
                    onVizDrillDownIntent={onVizDrillDownIntent}
                    onVizPointMenuIntent={onVizPointMenuIntent}
                />
            </Box>
            {pointMenuState && (
                <DataAppVizPointMenu
                    state={pointMenuState}
                    onClose={() => setPointMenuState(null)}
                    metricQuery={metricQuery}
                    showUnderlyingData={
                        pointMenuState.underlyingDataConfig !== undefined
                    }
                    onViewUnderlyingData={() => {
                        if (
                            openUnderlyingDataModal &&
                            pointMenuState.underlyingDataConfig
                        ) {
                            openUnderlyingDataModal(
                                pointMenuState.underlyingDataConfig,
                            );
                        }
                    }}
                    showFilters={isDashboardSurface}
                    trackingData={{
                        organizationId: user?.data?.organizationUuid,
                        userId: user?.data?.userUuid,
                        projectId: projectUuid,
                    }}
                />
            )}
            {isPreviewLoading && (
                <Box className={classes.loadingOverlay}>
                    <LoadingChart />
                </Box>
            )}
        </Box>
    );
};

export default DataAppVizRenderer;
