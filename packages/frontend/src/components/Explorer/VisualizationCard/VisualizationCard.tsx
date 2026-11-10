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
    useEffect,
    useLayoutEffect,
    useMemo,
    useState,
    type ComponentProps,
    type FC,
    type PropsWithChildren,
} from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router';
import ErrorBoundary from '../../../features/errorBoundary/ErrorBoundary';
import {
    explorerActions,
    selectChartConfig,
    selectChartType,
    selectChartTypeAuthoring,
    selectColumnOrder,
    selectIsEditMode,
    selectIsVisualizationConfigOpen,
    selectIsVisualizationExpanded,
    selectMetricQuery,
    selectParameters,
    selectPivotConfig,
    selectSavedChart,
    selectSorts,
    selectTableCalculationsMetadata,
    selectTableName,
    selectUnsavedChartVersion,
    useExplorerDispatch,
    useExplorerSelector,
    useExplorerStore,
} from '../../../features/explorer/store';
import { resolveMergeColumnOrder } from '../../../features/mergeQuery/utils/resolveMergeColumnOrder';
import { uploadGsheet } from '../../../hooks/gdrive/useGdrive';
import { useExplore } from '../../../hooks/useExplore';
import useApp from '../../../providers/App/useApp';
import { ExplorerSection } from '../../../providers/Explorer/types';
import useFullscreen from '../../../providers/Fullscreen/useFullscreen';
import { useLightdashApi } from '../../../providers/LightdashApi/useLightdashApi';
import ChartDownloadMenu from '../../common/ChartDownload/ChartDownloadMenu';
import CollapsableCard from '../../common/CollapsableCard/CollapsableCard';
import { COLLAPSABLE_CARD_BUTTON_PROPS } from '../../common/CollapsableCard/constants';
import MantineIcon from '../../common/MantineIcon';
import LightdashVisualization from '../../LightdashVisualization';
import { useEditedChartConfig } from '../../LightdashVisualization/useVisualizationContext';
import VisualizationProvider, {
    type VisualizationProviderProps,
} from '../../LightdashVisualization/VisualizationProvider';
import { type EchartsSeriesClickEvent } from '../../SimpleChart';
import SortButton from '../../SortButton';
import ExplorerChartSidebar from '../ChartGallery/ExplorerChartSidebar';
import { DevCopyChartDebugData } from '../ExplorerHeader/DevCopyChartDebugData';
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

// Only this wrapper follows the explorer's chart config, so an edit echoed
// back by the explorer re-renders the provider but not the card around it.
const ConnectedVisualizationProvider: FC<
    PropsWithChildren<Omit<VisualizationProviderProps, 'chartConfig'>>
> = ({ children, ...props }) => {
    const chartConfig = useExplorerSelector(selectChartConfig);
    return (
        <VisualizationProvider chartConfig={chartConfig} {...props}>
            {children}
        </VisualizationProvider>
    );
};

const ConnectedVisualizationWarning: FC<
    Omit<ComponentProps<typeof VisualizationWarning>, 'chartConfig'>
> = (props) => {
    const chartConfig = useEditedChartConfig();
    return <VisualizationWarning chartConfig={chartConfig} {...props} />;
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
    const lightdashApi = useLightdashApi();
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

    // Narrow reads: the chart config is followed by the connected provider
    // below, so edits do not re-render the card
    const explorerStore = useExplorerStore();
    const metricQuery = useExplorerSelector(selectMetricQuery);
    const tableName = useExplorerSelector(selectTableName);
    const columnOrder = useExplorerSelector(selectColumnOrder);
    const pivotConfig = useExplorerSelector(selectPivotConfig);
    const chartType = useExplorerSelector(selectChartType);
    const parameters = useExplorerSelector(selectParameters);
    const visualizationMetricQuery = suppressPrimaryResults
        ? undefined
        : (mergeResults?.metricQuery ?? metricQuery);
    const visualizationColumnOrder = mergeResults
        ? resolveMergeColumnOrder(mergeResults.columnOrder, columnOrder)
        : columnOrder;

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

    const { data: explore } = useExplore(tableName);

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

    // Deep link (e.g. the removed-chart-type recovery hint): arrive in edit
    // mode with the config sidebar already open, then drop the param.
    const [searchParams, setSearchParams] = useSearchParams();
    useEffect(() => {
        if (!isEditMode || searchParams.get('openVizConfig') !== 'true') return;
        openVisualizationConfig();
        const next = new URLSearchParams(searchParams);
        next.delete('openVizConfig');
        setSearchParams(next, { replace: true });
    }, [isEditMode, searchParams, setSearchParams, openVisualizationConfig]);

    const { target: portalTarget, ref: visualizationConfigButtonRef } =
        useVisualizationConfigPortalTarget(isVisualizationConfigOpen);

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
        // Once a merge owns the screen, the Explorer's own query is idle and
        // any error it still holds is stale.
        const queryError = merge?.replacesQuery
            ? undefined
            : (query.error?.error ?? queryResults.error?.error);

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
        merge?.replacesQuery,
    ]);

    const savedChartReference = useMemo(
        () =>
            savedChart
                ? { uuid: savedChart.uuid, chartConfig: savedChart.chartConfig }
                : undefined,
        [savedChart],
    );

    const dirtyPivotConfiguration = useDirtyPivotConfiguration();

    if (!tableName) {
        return <CollapsableCard title="Charts" disabled />;
    }

    const getGsheetLink = async (
        exportColumnOrder: string[],
        showTableNames: boolean,
        customLabels?: Record<string, string>,
    ) => {
        // Read at call time; the card does not subscribe to the chart config
        const unsavedChartVersion = selectUnsavedChartVersion(
            explorerStore.getState(),
        );
        if (explore?.name && unsavedChartVersion?.metricQuery && projectUuid) {
            const gsheetResponse = await uploadGsheet(lightdashApi, {
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
            <ConnectedVisualizationProvider
                key={savedChart?.uuid}
                minimal={minimal}
                initialPivotDimensions={pivotConfig?.columns}
                initialPivotRows={pivotConfig?.rows}
                unsavedMetricQuery={visualizationMetricQuery}
                resultsData={resultsData}
                apiErrorDetail={apiErrorDetail}
                isLoading={isLoadingQueryResults}
                columnOrder={visualizationColumnOrder}
                onSeriesContextMenu={onSeriesContextMenu}
                savedChartUuid={isEditMode ? undefined : savedChart?.uuid}
                savedChartReference={savedChartReference}
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
                    // Walkthrough look for view:SavedChart: the chart is
                    // the first thing to read on a saved chart. See
                    // scripts/scope-tours.
                    tourProps={{
                        'data-tour-scope': 'view:SavedChart',
                        'data-tour-look': '1',
                        'data-tour-after':
                            '[data-tour-anchor="chart-row"][data-tour-value="Orders over time"]',
                        'data-tour-label': 'The chart shows the answer',
                        'data-tour-docs':
                            'explore/explore-view.mdx#the-explore-page:li3',
                    }}
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
                                <ConnectedVisualizationWarning
                                    dirtyPivotConfiguration={
                                        dirtyPivotConfiguration
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
                                        ref={visualizationConfigButtonRef}
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
                                        <ExplorerChartSidebar
                                            chartType={chartType}
                                            onClose={closeVisualizationConfig}
                                        />,
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
            </ConnectedVisualizationProvider>
        </ErrorBoundary>
    );
});

export default VisualizationCard;
