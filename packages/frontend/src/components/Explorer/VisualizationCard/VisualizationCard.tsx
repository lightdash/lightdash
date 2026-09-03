import {
    getHiddenTableFields,
    getPivotConfig,
    NotFoundError,
    type ApiErrorDetail,
    type ChartConfig,
    type ChartType,
    type EChartsSeries,
    type FieldId,
} from '@lightdash/common';
import { Button } from '@mantine/core';
import { useElementSize } from '@mantine/hooks';
import {
    IconLayoutSidebarLeftCollapse,
    IconLayoutSidebarLeftExpand,
} from '@tabler/icons-react';
import {
    lazy,
    memo,
    Suspense,
    useCallback,
    useLayoutEffect,
    useMemo,
    useState,
    type FC,
} from 'react';
import { createPortal } from 'react-dom';
import ErrorBoundary from '../../../features/errorBoundary/ErrorBoundary';
import {
    explorerActions,
    selectChartTypeAuthoring,
    selectIsEditMode,
    selectIsVisualizationConfigOpen,
    selectIsVisualizationExpanded,
    selectParameters,
    selectSavedChart,
    selectSorts,
    selectTableCalculationsMetadata,
    selectUnsavedChartVersion,
    useExplorerDispatch,
    useExplorerSelector,
} from '../../../features/explorer/store';
import { resolveMergeColumnOrder } from '../../../features/mergeQuery/utils/resolveMergeColumnOrder';
import { uploadGsheet } from '../../../hooks/gdrive/useGdrive';
import { useExplore } from '../../../hooks/useExplore';
import useApp from '../../../providers/App/useApp';
import { ExplorerSection } from '../../../providers/Explorer/types';
import useFullscreen from '../../../providers/Fullscreen/useFullscreen';
import ChartDownloadMenu from '../../common/ChartDownload/ChartDownloadMenu';
import CollapsableCard from '../../common/CollapsableCard/CollapsableCard';
import { COLLAPSABLE_CARD_BUTTON_PROPS } from '../../common/CollapsableCard/constants';
import MantineIcon from '../../common/MantineIcon';
import LightdashVisualization from '../../LightdashVisualization';
import VisualizationProvider from '../../LightdashVisualization/VisualizationProvider';
import { type EchartsSeriesClickEvent } from '../../SimpleChart';
import SortButton from '../../SortButton';
import ExplorerChartSidebar from '../ChartGallery/ExplorerChartSidebar';
import { useIsChartGalleryEnabled } from '../ChartGallery/useIsChartGalleryEnabled';
import { DevCopyChartDebugData } from '../ExplorerHeader/DevCopyChartDebugData';
import VisualizationConfig from '../VisualizationCard/VisualizationConfig';
import { SeriesContextMenu } from './SeriesContextMenu';
import { useDirtyPivotConfiguration } from './useDirtyPivotConfiguration';
import { useExplorerChartColorPalette } from './useExplorerChartColorPalette';
import { useExplorerResultsData } from './useExplorerResultsData';
import useVisualizationConfigPortalTarget from './useVisualizationConfigPortalTarget';
import VisualizationTimezone from './VisualizationTimezone';
import VisualizationWarning from './VisualizationWarning';

// Lazy-load so the Explorer bundle stays small when nothing is authored.
const ExplorerChartTypeAuthoring = lazy(
    () => import('../ChartTypeAuthoring/ExplorerChartTypeAuthoring'),
);

export type EchartsClickEvent = {
    event: EchartsSeriesClickEvent;
    dimensions: string[];
    series: EChartsSeries[];
};

type Props = {
    projectUuid?: string;
    /** False keeps the card, its provider and the config sidebar alive
     *  without drawing the chart, so nothing renders twice while a chart
     *  type is authored in its place. */
    renderVisualization: boolean;
    onScreenshotReady?: () => void;
    onScreenshotError?: () => void;
    minimal?: boolean;
};

const VisualizationCard: FC<Props> = memo((props) => {
    const {
        projectUuid: fallBackUUid,
        renderVisualization,
        onScreenshotReady,
        onScreenshotError,
        minimal = false,
    } = props;
    const { health } = useApp();
    const dispatch = useExplorerDispatch();
    // In fullscreen the chart card header is hidden so the chart owns the viewport
    const { isFullscreen } = useFullscreen();
    const isChartGalleryEnabled = useIsChartGalleryEnabled();

    // Get savedChart from Redux
    const savedChart = useExplorerSelector(selectSavedChart);

    // Authoring opens the builder modal from inside this card's provider
    // tree, so the modal's config column shares the chart's viz context.
    const chartTypeAuthoring = useExplorerSelector(selectChartTypeAuthoring);

    const sorts = useExplorerSelector(selectSorts);

    const projectUuid = savedChart?.projectUuid || fallBackUUid;
    const colorPalette = useExplorerChartColorPalette(projectUuid);
    const {
        query,
        queryResults,
        getDownloadQueryUuid,
        validQueryArgs,
        missingRequiredParameters,
        merge,
        mergeResults,
        suppressPrimaryResults,
        isLoadingQueryResults,
        resultsData,
    } = useExplorerResultsData();

    const unsavedChartVersion = useExplorerSelector(selectUnsavedChartVersion);
    const parameters = useExplorerSelector(selectParameters);
    const visualizationMetricQuery = suppressPrimaryResults
        ? undefined
        : (mergeResults?.metricQuery ?? unsavedChartVersion.metricQuery);
    const visualizationColumnOrder = mergeResults
        ? resolveMergeColumnOrder(
              mergeResults.columnOrder,
              unsavedChartVersion.tableConfig.columnOrder,
          )
        : unsavedChartVersion.tableConfig.columnOrder;

    const handleSetPivotFields = useCallback(
        (fields: FieldId[] = []) => {
            dispatch(explorerActions.setPivotColumns(fields));
        },
        [dispatch],
    );

    const handleSetPivotRows = useCallback(
        (rows: FieldId[] = []) => {
            dispatch(explorerActions.setPivotRows(rows));
        },
        [dispatch],
    );

    const handleSetChartType = useCallback(
        (chartType: ChartType) => {
            dispatch(explorerActions.setChartType({ chartType }));
        },
        [dispatch],
    );

    const handleSetChartConfig = useCallback(
        (chartConfig: ChartConfig) => {
            dispatch(
                explorerActions.setChartConfig({
                    chartConfig,
                }),
            );
        },
        [dispatch],
    );

    const isVisualizationExpanded = useExplorerSelector(
        selectIsVisualizationExpanded,
    );
    // Without the heading there is no way to expand the card, so force it open
    const isOpen = minimal || isVisualizationExpanded || isFullscreen;
    const isEditMode = useExplorerSelector(selectIsEditMode);
    const isVisualizationConfigOpen = useExplorerSelector(
        selectIsVisualizationConfigOpen,
    );
    const toggleExpandedSection = useCallback(
        (section: ExplorerSection) => {
            dispatch(explorerActions.toggleExpandedSection(section));
        },
        [dispatch],
    );

    const tableCalculationsMetadata = useExplorerSelector(
        selectTableCalculationsMetadata,
    );

    const toggleSection = useCallback(
        () => toggleExpandedSection(ExplorerSection.VISUALIZATION),
        [toggleExpandedSection],
    );

    const { data: explore } = useExplore(unsavedChartVersion.tableName);

    const [echartsClickEvent, setEchartsClickEvent] =
        useState<EchartsClickEvent>();

    const openVisualizationConfig = useCallback(
        () => dispatch(explorerActions.openVisualizationConfig()),
        [dispatch],
    );
    const closeVisualizationConfig = useCallback(
        () => dispatch(explorerActions.closeVisualizationConfig()),
        [dispatch],
    );

    const portalTarget = useVisualizationConfigPortalTarget(
        isVisualizationConfigOpen,
        { followHost: isChartGalleryEnabled },
    );

    const {
        ref: measureRef,
        width: containerWidth,
        height: containerHeight,
    } = useElementSize();

    useLayoutEffect(() => {
        if (!isEditMode) {
            closeVisualizationConfig();
        }
    }, [isEditMode, closeVisualizationConfig]);

    useLayoutEffect(() => {
        if (!isOpen) {
            closeVisualizationConfig();
        }
    }, [closeVisualizationConfig, isOpen]);

    const onSeriesContextMenu = useCallback(
        (e: EchartsSeriesClickEvent, series: EChartsSeries[]) => {
            setEchartsClickEvent({
                event: e,
                dimensions: visualizationMetricQuery?.dimensions ?? [],
                series,
            });
        },
        [visualizationMetricQuery],
    );

    const apiErrorDetail = useMemo(() => {
        const queryError = query.error?.error ?? queryResults.error?.error;

        if (merge?.runError) return merge.runError.error;
        if (merge?.runErrors.length) {
            return {
                message: merge.runErrors
                    .map((error) => error.message)
                    .join(' '),
                name: 'Error',
                statusCode: 400,
                data: {},
            } satisfies ApiErrorDetail;
        }

        return !missingRequiredParameters?.length
            ? queryError
            : // Mimicking an API Error Detail so it can be used in the EmptyState component
              ({
                  message: 'Missing required parameters',
                  name: 'Error',
                  statusCode: 400,
                  data: {},
              } satisfies ApiErrorDetail);
    }, [
        query.error?.error,
        queryResults.error?.error,
        missingRequiredParameters,
        merge?.runError,
        merge?.runErrors,
    ]);

    const dirtyPivotConfiguration = useDirtyPivotConfiguration();

    if (!unsavedChartVersion.tableName) {
        return <CollapsableCard title="Charts" disabled />;
    }

    const getGsheetLink = async (
        exportColumnOrder: string[],
        showTableNames: boolean,
        customLabels?: Record<string, string>,
    ) => {
        if (explore?.name && unsavedChartVersion?.metricQuery && projectUuid) {
            const gsheetResponse = await uploadGsheet({
                projectUuid,
                exploreId: explore?.name,
                metricQuery: unsavedChartVersion?.metricQuery,
                columnOrder: exportColumnOrder,
                showTableNames,
                parameters,
                customLabels,
                hiddenFields: getHiddenTableFields(
                    unsavedChartVersion.chartConfig,
                ),
                pivotConfig: getPivotConfig(unsavedChartVersion),
            });
            return gsheetResponse;
        }
        throw new NotFoundError('no metric query defined');
    };

    if (health.isInitialLoading || !health.data) {
        return null;
    }

    return (
        <ErrorBoundary>
            <VisualizationProvider
                key={savedChart?.uuid}
                minimal={minimal}
                chartConfig={unsavedChartVersion.chartConfig}
                initialPivotDimensions={
                    unsavedChartVersion.pivotConfig?.columns
                }
                initialPivotRows={unsavedChartVersion.pivotConfig?.rows}
                unsavedMetricQuery={visualizationMetricQuery}
                resultsData={resultsData}
                apiErrorDetail={apiErrorDetail}
                isLoading={isLoadingQueryResults}
                columnOrder={visualizationColumnOrder}
                onSeriesContextMenu={onSeriesContextMenu}
                savedChartUuid={isEditMode ? undefined : savedChart?.uuid}
                savedChartReference={
                    savedChart
                        ? {
                              uuid: savedChart.uuid,
                              chartConfig: savedChart.chartConfig,
                          }
                        : undefined
                }
                onChartConfigChange={handleSetChartConfig}
                onChartTypeChange={handleSetChartType}
                onPivotDimensionsChange={handleSetPivotFields}
                onPivotRowsChange={handleSetPivotRows}
                colorPalette={colorPalette}
                tableCalculationsMetadata={tableCalculationsMetadata}
                parameters={
                    mergeResults?.usedParametersValues ??
                    query.data?.usedParametersValues
                }
                containerWidth={containerWidth}
                containerHeight={containerHeight}
                isDashboard={false}
                isEditMode={isEditMode}
                invalidateCache={validQueryArgs?.invalidateCache}
            >
                <CollapsableCard
                    title="Chart"
                    isOpen={isOpen}
                    isVisualizationCard
                    hideHeading={isFullscreen || minimal}
                    minimal={minimal}
                    onToggle={toggleSection}
                    headerElement={
                        isOpen && (
                            <>
                                {sorts.length > 0 && (
                                    <SortButton
                                        sorts={sorts}
                                        isEditMode={isEditMode}
                                    />
                                )}
                                <VisualizationWarning
                                    dirtyPivotConfiguration={
                                        dirtyPivotConfiguration
                                    }
                                    chartConfig={
                                        unsavedChartVersion.chartConfig
                                    }
                                    resultsData={resultsData}
                                    isLoading={isLoadingQueryResults}
                                    maxColumnLimit={
                                        health.data?.pivotTable?.maxColumnLimit
                                    }
                                />
                            </>
                        )
                    }
                    rightHeaderElement={
                        isOpen && (
                            <>
                                <VisualizationTimezone
                                    resolvedTimezone={
                                        query.data?.resolvedTimezone
                                    }
                                    timezoneSetting={
                                        query.data?.metricQuery?.timezone
                                    }
                                />
                                {isEditMode ? (
                                    <Button
                                        {...COLLAPSABLE_CARD_BUTTON_PROPS}
                                        onClick={
                                            isVisualizationConfigOpen
                                                ? closeVisualizationConfig
                                                : openVisualizationConfig
                                        }
                                        rightSection={
                                            <MantineIcon
                                                icon={
                                                    isVisualizationConfigOpen
                                                        ? IconLayoutSidebarLeftCollapse
                                                        : IconLayoutSidebarLeftExpand
                                                }
                                            />
                                        }
                                    >
                                        {isVisualizationConfigOpen
                                            ? 'Close configure'
                                            : 'Configure'}
                                    </Button>
                                ) : null}

                                {/*
                                 * NOTE: not using Mantine Portal because this page lacks a MantineProvider
                                 * TODO: use Mantine Portal with reuseTargetNode flag to avoid rendering additional divs
                                 */}
                                {portalTarget &&
                                    // The modal owns the config while a type
                                    // is authored; a second mount in the
                                    // sidebar would echo its state.
                                    !chartTypeAuthoring &&
                                    createPortal(
                                        isChartGalleryEnabled ? (
                                            <ExplorerChartSidebar
                                                chartType={
                                                    unsavedChartVersion
                                                        .chartConfig.type
                                                }
                                                onClose={
                                                    closeVisualizationConfig
                                                }
                                            />
                                        ) : (
                                            <VisualizationConfig
                                                chartType={
                                                    unsavedChartVersion
                                                        .chartConfig.type
                                                }
                                                onClose={
                                                    closeVisualizationConfig
                                                }
                                            />
                                        ),
                                        portalTarget,
                                    )}

                                {!!projectUuid && (
                                    <ChartDownloadMenu
                                        getDownloadQueryUuid={
                                            mergeResults && merge
                                                ? merge.getDownloadQueryUuid
                                                : getDownloadQueryUuid
                                        }
                                        projectUuid={projectUuid}
                                        chartName={savedChart?.name}
                                        getGsheetLink={
                                            mergeResults
                                                ? undefined
                                                : getGsheetLink
                                        }
                                    />
                                )}

                                {import.meta.env.DEV && (
                                    <DevCopyChartDebugData />
                                )}
                            </>
                        )
                    }
                >
                    {renderVisualization && (
                        <>
                            <LightdashVisualization
                                ref={measureRef}
                                className="sentry-block ph-no-capture"
                                data-testid="visualization"
                                onScreenshotReady={onScreenshotReady}
                                onScreenshotError={onScreenshotError}
                            />
                            <SeriesContextMenu
                                echartsSeriesClickEvent={
                                    echartsClickEvent?.event
                                }
                                dimensions={echartsClickEvent?.dimensions}
                                series={echartsClickEvent?.series}
                                explore={explore}
                            />
                        </>
                    )}
                </CollapsableCard>
                {chartTypeAuthoring && (
                    <Suspense fallback={null}>
                        <ExplorerChartTypeAuthoring
                            authoring={chartTypeAuthoring}
                        />
                    </Suspense>
                )}
            </VisualizationProvider>
        </ErrorBoundary>
    );
});

export default VisualizationCard;
