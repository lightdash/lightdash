import {
    buildDrillThroughState,
    CartesianSeriesType,
    ECHARTS_DEFAULT_COLORS,
    getDimensions,
    type ApiExploreResults,
    type DrillPath,
    type EChartsSeries,
    type ResultValue,
    type SavedChart,
    type Series,
} from '@lightdash/common';
import { Center, Loader } from '@mantine-8/core';
import { useMantineColorScheme } from '@mantine/core';
import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type FC,
    type RefObject,
} from 'react';
import { Provider } from 'react-redux';
import {
    buildInitialExplorerState,
    createExplorerStore,
    explorerActions,
    selectUnsavedChartVersion,
    useExplorerDispatch,
    useExplorerSelector,
} from '../../features/explorer/store';
import {
    getExpectedSeriesMap,
    mergeExistingAndExpectedSeries,
} from '../../hooks/cartesianChartConfig/utils';
import { useOrganization } from '../../hooks/organization/useOrganization';
import { useDrillQuery } from '../../hooks/useDrillQuery';
import { useDrillThroughAction } from '../../hooks/useDrillThroughAction';
import { ExplorerSection } from '../../providers/Explorer/types';
import DrillDownBreadcrumb from '../common/DrillDownBreadcrumb';
import { type EChartsReact } from '../EChartsReactWrapper';
import { SeriesContextMenu } from '../Explorer/VisualizationCard/SeriesContextMenu';
import { type Limit } from '../ExportResults/types';
import LightdashVisualization from '../LightdashVisualization';
import VisualizationProvider from '../LightdashVisualization/VisualizationProvider';
import { DrillDownModal } from '../MetricQueryData/DrillDownModal';
import DrillThroughModal from '../MetricQueryData/DrillThroughModal';
import MetricQueryDataProvider from '../MetricQueryData/MetricQueryDataProvider';
import { type EchartsSeriesClickEvent } from '../SimpleChart';

type DrillExplorerProviderProps = {
    chart: SavedChart;
    explore: ApiExploreResults;
    tileUuid: string;
    initialDrill: {
        drillPath: DrillPath;
        fieldValues: Record<string, ResultValue>;
        dimensionIds: string[];
    };
    onDrillEnd: () => void;
    setEchartsRef?: (ref: RefObject<EChartsReact | null> | undefined) => void;
    onDrillExportReady?: (
        getDownloadQueryUuid: (
            limit: number | null,
            limitType: Limit,
        ) => Promise<string>,
        totalResults: number | undefined,
    ) => void;
};

const DrillExplorerContent: FC<{
    chart: SavedChart;
    explore: ApiExploreResults;
    tileUuid: string;
    onDrillEnd: () => void;
    setEchartsRef?: (ref: RefObject<EChartsReact | null> | undefined) => void;
    onDrillExportReady?: (
        getDownloadQueryUuid: (
            limit: number | null,
            limitType: Limit,
        ) => Promise<string>,
        totalResults: number | undefined,
    ) => void;
}> = ({
    chart,
    explore,
    tileUuid,
    onDrillEnd,
    setEchartsRef,
    onDrillExportReady,
}) => {
    const dispatch = useExplorerDispatch();
    const unsavedChartVersion = useExplorerSelector(selectUnsavedChartVersion);

    const { data: org } = useOrganization();
    const { colorScheme } = useMantineColorScheme();
    const colorPalette = useMemo(() => {
        if (colorScheme === 'dark' && org?.chartDarkColors) {
            return org.chartDarkColors;
        }
        return org?.chartColors ?? ECHARTS_DEFAULT_COLORS;
    }, [colorScheme, org?.chartColors, org?.chartDarkColors]);

    // Drill query execution (extracted hook)
    const { drillState, drillSteps, drillResults, isLoading } = useDrillQuery(
        chart,
        tileUuid,
        onDrillExportReady,
    );

    // Exit drill mode when drillState transitions to null (skip initial render)
    const hasInitialized = useRef(false);
    useEffect(() => {
        if (!hasInitialized.current) {
            hasInitialized.current = true;
            return;
        }
        if (!drillState) {
            onDrillEnd();
        }
    }, [drillState, onDrillEnd]);

    // Context menu state
    const [echartsClickEvent, setEchartsClickEvent] =
        useState<EchartsSeriesClickEvent>();
    const [clickSeries, setClickSeries] = useState<EChartsSeries[]>();
    const onSeriesContextMenu = useCallback(
        (e: EchartsSeriesClickEvent, series: EChartsSeries[]) => {
            setEchartsClickEvent(e);
            setClickSeries(series);
        },
        [],
    );

    // Linked chart drill-through modal
    const {
        modalState: linkedChartDrillConfig,
        handleDrillThrough,
        closeModal: closeDrillThroughModal,
    } = useDrillThroughAction();

    // Compute series for the drilled chart (empty eChartsConfig needs explicit series)
    const computedSeries: Series[] = useMemo(() => {
        if (!drillResults) return [];
        const xField = drillResults.metricQuery.dimensions[0];
        const yFields = drillResults.metricQuery.metrics;
        const expectedSeriesMap = getExpectedSeriesMap({
            defaultCartesianType: CartesianSeriesType.BAR,
            defaultAreaStyle: undefined,
            availableDimensions: drillResults.metricQuery.dimensions,
            isStacked: false,
            pivotKeys: undefined,
            resultsData: {
                rows: drillResults.rows,
                isInitialLoading: false,
                isFetchingFirstPage: false,
                isFetchingRows: false,
                isFetchingAllPages: false,
                fetchMoreRows: () => {},
                setFetchAll: () => {},
                fetchAll: false,
                hasFetchedAllRows: true,
                totalClientFetchTimeMs: undefined,
                error: null,
            },
            xField,
            yFields,
            itemsMap: drillResults.fields,
        });
        return mergeExistingAndExpectedSeries({
            expectedSeriesMap,
            existingSeries: [],
            sortedByPivot: false,
        });
    }, [drillResults]);

    if (!drillState) return null;

    return (
        <div
            style={{
                display: 'flex',
                flexDirection: 'column',
                width: '100%',
                height: '100%',
                minHeight: 'inherit',
            }}
        >
            <div style={{ flexShrink: 0 }}>
                <DrillDownBreadcrumb
                    compact
                    stack={drillState.stack}
                    onReset={() => dispatch(explorerActions.clearDrill())}
                    onPopTo={(index) =>
                        dispatch(explorerActions.popDrillTo(index))
                    }
                />
            </div>

            <div style={{ flex: 1, minHeight: 0 }}>
                {isLoading && (
                    <Center style={{ width: '100%', height: '100%' }}>
                        <Loader size="md" />
                    </Center>
                )}

                {!isLoading && drillResults && (
                    <MetricQueryDataProvider
                        metricQuery={drillResults.metricQuery}
                        tableName={chart.tableName || ''}
                        explore={explore}
                        queryUuid={drillResults.queryUuid}
                    >
                        <VisualizationProvider
                            chartConfig={
                                {
                                    type: unsavedChartVersion.chartConfig.type,
                                    config: {
                                        layout: {
                                            xField: drillResults.metricQuery
                                                .dimensions[0],
                                            yField: drillResults.metricQuery
                                                .metrics,
                                            flipAxes: false,
                                        },
                                        eChartsConfig: {},
                                    },
                                } as typeof unsavedChartVersion.chartConfig
                            }
                            initialPivotDimensions={undefined}
                            computedSeries={computedSeries}
                            unsavedMetricQuery={drillResults.metricQuery}
                            resultsData={{
                                rows: drillResults.rows,
                                metricQuery: drillResults.metricQuery,
                                fields: drillResults.fields,
                                isInitialLoading: false,
                                isFetchingFirstPage: false,
                                isFetchingRows: false,
                                isFetchingAllPages: false,
                                fetchMoreRows: () => {},
                                setFetchAll: () => {},
                                fetchAll: false,
                                hasFetchedAllRows: true,
                                totalClientFetchTimeMs: undefined,
                                error: null,
                            }}
                            isLoading={false}
                            onSeriesContextMenu={onSeriesContextMenu}
                            columnOrder={[
                                ...drillResults.metricQuery.dimensions,
                                ...drillResults.metricQuery.metrics,
                            ]}
                            pivotTableMaxColumnLimit={1000}
                            colorPalette={colorPalette}
                            setEchartsRef={setEchartsRef}
                            isDashboard
                            drillConfig={unsavedChartVersion.drillConfig}
                            onDrillDown={(params) =>
                                dispatch(explorerActions.applyDrill(params))
                            }
                            onDrillThrough={({
                                drillPathId,
                                linkedChartUuid,
                                fieldValues: clickedValues,
                                dimensionIds: clickedDims,
                            }) => {
                                handleDrillThrough(
                                    buildDrillThroughState({
                                        sourceChartUuid: chart.uuid,
                                        drillPathId,
                                        linkedChartUuid,
                                        drillConfig:
                                            unsavedChartVersion.drillConfig,
                                        fieldValues: clickedValues,
                                        dimensionIds: clickedDims,
                                        dimensions: getDimensions(explore),
                                        existingDrillSteps: drillSteps,
                                    }),
                                );
                            }}
                        >
                            <LightdashVisualization
                                isDashboard
                                tileUuid={tileUuid}
                                isTitleHidden
                            />

                            <SeriesContextMenu
                                echartsSeriesClickEvent={echartsClickEvent}
                                dimensions={drillResults.metricQuery.dimensions}
                                series={clickSeries}
                                explore={explore}
                            />
                        </VisualizationProvider>
                        <DrillDownModal />
                    </MetricQueryDataProvider>
                )}

                {linkedChartDrillConfig && (
                    <DrillThroughModal
                        opened={!!linkedChartDrillConfig}
                        onClose={closeDrillThroughModal}
                        sourceChartUuid={linkedChartDrillConfig.sourceChartUuid}
                        linkedChartUuid={linkedChartDrillConfig.linkedChartUuid}
                        drillSteps={linkedChartDrillConfig.drillSteps}
                        filterSummary={linkedChartDrillConfig.filterSummary}
                        filterDetails={linkedChartDrillConfig.filterDetails}
                    />
                )}
            </div>
        </div>
    );
};

/**
 * Creates a scoped Explorer Redux store for a single dashboard tile's
 * drill session. Zero cost for non-drilled tiles.
 */
const DrillExplorerProvider: FC<DrillExplorerProviderProps> = ({
    chart,
    explore,
    tileUuid,
    initialDrill,
    onDrillEnd,
    setEchartsRef,
    onDrillExportReady,
}) => {
    const [store] = useState(() => {
        const state = buildInitialExplorerState({
            savedChart: chart,
            isEditMode: false,
            expandedSections: [ExplorerSection.VISUALIZATION],
            minimal: true,
        });
        const s = createExplorerStore({ explorer: state });
        s.dispatch(explorerActions.applyDrill(initialDrill));
        return s;
    });

    return (
        <Provider store={store}>
            <DrillExplorerContent
                chart={chart}
                explore={explore}
                tileUuid={tileUuid}
                onDrillEnd={onDrillEnd}
                setEchartsRef={setEchartsRef}
                onDrillExportReady={onDrillExportReady}
            />
        </Provider>
    );
};

export default DrillExplorerProvider;
