import {
    ChartType,
    deriveDataAppVizFieldMetadata,
    getEffectiveOptionValues,
    hasCustomBinDimension,
    MERGE_TABLE_NAME,
    type DataAppVizContext,
    type ExternalFetchRequest,
    type ItemsMap,
    type ResultRow,
} from '@lightdash/common';
import { useCallback, useEffect, useMemo, useState, type FC } from 'react';
import { useLocation } from 'react-router';
import useEmbed from '../../ee/providers/Embed/useEmbed';
import { useChartVersionPreview } from '../../features/apps/ChartVersionPreview/useChartVersionPreview';
import { useDocumentRenderTarget } from '../../features/chartTypes/documentRenderTarget/useDocumentRenderTarget';
import { useDataAppVizRenderMetadata } from '../../features/chartTypes/hooks/useDataAppVizRender';
import { useDataAppVizResolvedColors } from '../../features/chartTypes/hooks/useDataAppVizResolvedColors';
import { useVizSubtotalSource } from '../../features/chartTypes/hooks/useVizSubtotalSource';
import { reconcileDataAppVizFieldMapping } from '../../features/chartTypes/utils/autoMapDataAppVizFields';
import {
    getVizHierarchyDimensions,
    hasVizSubtotalValues,
} from '../../features/chartTypes/utils/vizSubtotals';
import useToaster from '../../hooks/toaster/useToaster';
import { useContextMenuPermissions } from '../../hooks/useContextMenuPermissions';
import { useExplore } from '../../hooks/useExplore';
import { useProjectUuid } from '../../hooks/useProjectUuid';
import useApp from '../../providers/App/useApp';
import useTracking from '../../providers/Tracking/useTracking';
import { EventName } from '../../types/Events';
import { isDataAppVizVisualizationConfig } from '../LightdashVisualization/types';
import { useVisualizationContext } from '../LightdashVisualization/useVisualizationContext';
import { useMetricQueryDataContext } from '../MetricQueryData/useMetricQueryDataContext';
import { DataAppVizFrame } from './DataAppVizFrame';
import DataAppVizPointMenu from './DataAppVizPointMenu';
import { resolveVizDrillDownConfig } from './vizDrillDownConfig';
import {
    resolveVizPointMenuState,
    type VizPointMenuState,
} from './vizPointMenuConfig';
import { resolveVizUnderlyingDataConfig } from './vizUnderlyingDataConfig';
import { buildVizUnderlyingDataRequest } from './vizUnderlyingDataRequest';

type Props = {
    isInDashboard?: boolean;
    onScreenshotReady?: () => void;
    onScreenshotError?: () => void;
};

const EMPTY_ITEMS_MAP: ItemsMap = {};
const EMPTY_ROWS: ResultRow[] = [];
const EMPTY_FIELD_MAPPING = {};

const DataAppVizRenderer: FC<Props> = ({
    isInDashboard = false,
    onScreenshotReady,
}) => {
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
    const { user, health } = useApp();
    // Fail-silent: /minimal routes at desktop viewports mount no
    // TrackingProvider (App.tsx `enabled={isMobile || !isMinimalPage}`), so
    // screenshot/export/unfurl renders simply skip the drill-by event.
    const trackingContext = useTracking({ failSilently: true });

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
    const documentTarget = useDocumentRenderTarget();
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
            document: documentTarget,
        }),
        [embedToken, renderSavedChartUuid, chartVersionUuid, documentTarget],
    );
    // External connections authorize through whatever renders the chart, in
    // the same order as the render target: a Document chart, then a saved chart.
    const chartContext = useMemo<
        ExternalFetchRequest['chartContext'] | undefined
    >(() => {
        if (!embedToken && documentTarget) {
            return {
                documentUuid: documentTarget.documentUuid,
                documentVersionUuid: documentTarget.versionUuid,
                chartId: documentTarget.chartId,
            };
        }
        return renderSavedChartUuid
            ? {
                  savedChartUuid: renderSavedChartUuid,
                  chartVersionUuid,
              }
            : undefined;
    }, [embedToken, documentTarget, renderSavedChartUuid, chartVersionUuid]);
    // Embedded previews retain their recorded version; Chart Studio's
    // chart-less edit canvas previews the latest generated version.
    const renderPinnedVersion =
        embedToken || renderSavedChartUuid || documentTarget || !isEditMode
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
    // The backend refuses column subtotals over merged results.
    const isMergedResult =
        resultsData?.metricQuery?.exploreName === MERGE_TABLE_NAME;
    const hierarchyDimensions = useMemo(
        () =>
            reconciledFieldMapping &&
            !isMergedResult &&
            hasVizSubtotalValues(itemsMap ?? EMPTY_ITEMS_MAP)
                ? getVizHierarchyDimensions(
                      readyMetadata?.schema,
                      reconciledFieldMapping,
                  )
                : null,
        [
            readyMetadata?.schema,
            reconciledFieldMapping,
            isMergedResult,
            itemsMap,
        ],
    );
    const subtotalSource = useVizSubtotalSource({
        projectUuid,
        sourceQueryUuid,
        dimensions: hierarchyDimensions,
    });
    const subtotalDimensions = subtotalSource?.dimensions ?? null;
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
            subtotals: subtotalDimensions
                ? { enabled: true, dimensions: subtotalDimensions }
                : { enabled: false, dimensions: [] },
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
        subtotalDimensions,
        underlyingDataEnabled,
        underlyingDataOpenEnabled,
        drillDownEnabled,
        pointMenuEnabled,
    ]);

    const canRecover = !embedToken && !minimal;
    const recoveryAction = isEditMode
        ? 'Open Configure and choose another chart type'
        : 'Edit the chart to choose another chart type';
    // Embed viewers and headless captures can't act on the removal, so the
    // recovery hint only shows in-app. Lands in edit mode with the config open.
    const removedHint = canRecover
        ? {
              hint: health.data?.softDelete.enabled
                  ? `${recoveryAction}, or restore the chart type from Recently deleted.`
                  : `${recoveryAction}.`,
              hintLink:
                  !isEditMode && savedChartUuid
                      ? {
                            label: 'Edit chart',
                            to: `/projects/${projectUuid}/saved/${savedChartUuid}/edit?openVizConfig=true`,
                        }
                      : undefined,
          }
        : null;

    const pinnedChartlessArtifact =
        !renderSavedChartUuid &&
        !isEditMode &&
        renderPinnedVersion !== undefined;
    const unavailablePlaceholder = pinnedChartlessArtifact
        ? {
              message: `Custom chart type version ${renderPinnedVersion} is unavailable.`,
              hint: 'Regenerate the chart to use a renderable version.',
          }
        : {
              message:
                  renderSavedChartUuid &&
                  config?.dataAppVizVersion !== undefined
                      ? 'The saved custom chart type version is unavailable.'
                      : 'Custom chart type preview is unavailable.',
          };

    return (
        <DataAppVizFrame
            projectUuid={projectUuid}
            dataAppVizUuid={dataAppVizUuid}
            renderTarget={renderTarget}
            renderPinnedVersion={renderPinnedVersion}
            renderMetadata={renderMetadata}
            renderMetadataError={renderMetadataError}
            chartContext={chartContext}
            context={dataAppVizContext}
            isLoading={isLoading}
            isInDashboard={isInDashboard}
            onScreenshotReady={onScreenshotReady}
            errorReport={{
                savedChartUuid,
                pinnedVersion: config?.dataAppVizVersion,
            }}
            removedHint={removedHint}
            unavailablePlaceholder={unavailablePlaceholder}
            interactions={{
                rewriteVizUnderlyingDataRequest,
                onVizUnderlyingDataIntent,
                onVizDrillDownIntent,
                onVizPointMenuIntent,
                onVizSubtotalsIntent: subtotalSource?.get,
            }}
        >
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
        </DataAppVizFrame>
    );
};

export default DataAppVizRenderer;
