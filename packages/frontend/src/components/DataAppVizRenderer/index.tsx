import {
    ChartType,
    getEffectiveOptionValues,
    hasCustomBinDimension,
    type ApiError,
    type DataAppVizContext,
    type ItemsMap,
    type ResultRow,
} from '@lightdash/common';
import { Stack, Text } from '@mantine/core';
import { IconPuzzle } from '@tabler/icons-react';
import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type FC,
} from 'react';
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
import MantineIcon from '../common/MantineIcon';
import { isDataAppVizVisualizationConfig } from '../LightdashVisualization/types';
import { useVisualizationContext } from '../LightdashVisualization/useVisualizationContext';
import { useMetricQueryDataContext } from '../MetricQueryData/useMetricQueryDataContext';
import { SCREENSHOT_READY_FALLBACK_MS } from './constants';
import { resolveVizDrillDownConfig } from './vizDrillDownConfig';
import { buildVizUnderlyingDataRequest } from './vizUnderlyingDataRequest';

type Props = {
    onScreenshotReady?: () => void;
    onScreenshotError?: () => void;
};

const DataAppVizPlaceholder: FC<{ message: string }> = ({ message }) => (
    <Stack align="center" justify="center" gap="xs" h="100%" w="100%">
        <MantineIcon icon={IconPuzzle} size="xl" color="ldGray.5" />
        <Text c="dimmed" size="sm" ta="center">
            {message}
        </Text>
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
    } = useVisualizationContext();
    const { embedToken } = useEmbed();
    const { canViewUnderlyingData, canDrillInto } = useContextMenuPermissions();
    const previewOrigin = usePreviewOrigin();
    const { user } = useApp();
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

    // The iframe SDK posts `lightdash:sdk:screenshot-available` at bundle
    // boot — proof the sandbox is alive, not that the viz painted.
    const [screenshotAnnounced, setScreenshotAnnounced] = useState(false);
    const handleScreenshotAvailabilityChange = useCallback(
        (available: boolean) => {
            if (available) setScreenshotAnnounced(true);
        },
        [],
    );

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
    const { data: renderMetadata, error: renderMetadataError } =
        useDataAppVizRenderMetadata(projectUuid, dataAppVizUuid, renderTarget);
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
            underlyingData: { enabled: underlyingDataEnabled },
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
        drillDownEnabled,
    ]);

    // Ready only once the sandbox has booted AND the viz context has been
    // handed to the bridge (whose push effect commits before this one).
    useEffect(() => {
        if (screenshotAnnounced && dataAppVizContext) signalScreenshotReady();
    }, [screenshotAnnounced, dataAppVizContext, signalScreenshotReady]);

    // Terminal placeholders never mount the iframe — their frame is final,
    // so report ready now instead of stalling until the fallback timeout.
    const terminalRequestErrorMessage = getTerminalRequestErrorMessage([
        renderMetadataError,
        getVisiblePreviewTokenError(previewTokenError, !!token),
    ]);
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

    // Armed once on mount — capture surfaces pass the callback from mount.
    useEffect(() => {
        if (!onScreenshotReadyRef.current) return;
        const timer = setTimeout(
            signalScreenshotReady,
            SCREENSHOT_READY_FALLBACK_MS,
        );
        return () => clearTimeout(timer);
    }, [signalScreenshotReady]);

    if (!projectUuid || dataAppVizUuid === null) {
        return (
            <DataAppVizPlaceholder message="Pick a custom chart type to render." />
        );
    }

    if (terminalRequestErrorMessage) {
        return <DataAppVizPlaceholder message={terminalRequestErrorMessage} />;
    }

    if (!renderMetadata) {
        return (
            <DataAppVizPlaceholder
                message={
                    renderMetadataError
                        ? 'Custom chart type could not be loaded.'
                        : 'Loading custom chart type…'
                }
            />
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

    if (!token) {
        return (
            <DataAppVizPlaceholder
                message={
                    previewTokenError
                        ? 'Custom chart type could not be loaded.'
                        : 'Loading custom chart type…'
                }
            />
        );
    }

    const previewUrl = `${previewOrigin}/api/apps/${dataAppVizUuid}/versions/${renderMetadata.version}/t/${token}/?r=0#transport=postMessage&projectUuid=${projectUuid}`;

    return (
        <AppIframePreview
            src={previewUrl}
            previewToken={token}
            expectedPreviewOrigin={previewOrigin}
            projectUuid={projectUuid}
            appUuid={dataAppVizUuid}
            identityKey={dataAppVizUuid}
            dataAppVizContext={dataAppVizContext}
            onScreenshotAvailabilityChange={handleScreenshotAvailabilityChange}
            rewriteVizUnderlyingDataRequest={rewriteVizUnderlyingDataRequest}
            onVizDrillDownIntent={onVizDrillDownIntent}
        />
    );
};

export default DataAppVizRenderer;
