import {
    ChartType,
    mergeDashboardCustomMetrics,
    type AdditionalMetric,
    type SavedChart,
} from '@lightdash/common';
import { IconChartBar } from '@tabler/icons-react';
import { useCallback, useMemo, useState, type FC } from 'react';
import { Provider } from 'react-redux';
import {
    buildInitialExplorerState,
    createExplorerStore,
} from '../../features/explorer/store';
import { MergeProvider } from '../../features/mergeQuery/context/MergeContext';
import { useDashboardCustomMetricSeed } from '../../hooks/dashboard/useDashboardCustomMetricSeed';
import { useExplore } from '../../hooks/useExplore';
import { useExplorerQueryEffects } from '../../hooks/useExplorerQueryEffects';
import { ExplorerSection } from '../../providers/Explorer/types';
import { ModalHostedContext } from '../../providers/Explorer/useIsModalHosted';
import MantineModal from '../common/MantineModal';
import Page from '../common/Page/Page';
import Explorer from '../Explorer';
import ExploreSideBar from '../Explorer/ExploreSideBar';
import PageSpinner from '../PageSpinner';

type ContentProps = {
    exploreId: string;
    editChart?: SavedChart;
    seededMetrics: AdditionalMetric[];
    onExploreSelect: (exploreName: string) => void;
    onBackToTables: () => void;
};

const DashboardChartEditorContent: FC<ContentProps> = ({
    exploreId,
    editChart,
    seededMetrics,
    onExploreSelect,
    onBackToTables,
}) => {
    const { data } = useExplore(exploreId);

    // Store initializes once; the parent key remounts it per session.
    // No useExplorerRoute — it would rewrite the dashboard URL from the modal.
    const [store] = useState(() =>
        createExplorerStore({
            explorer: buildInitialExplorerState({
                isEditMode: true,
                initialState: {
                    expandedSections: [
                        ExplorerSection.FILTERS,
                        ExplorerSection.VISUALIZATION,
                        ExplorerSection.RESULTS,
                    ],
                    savedChart: editChart,
                    unsavedChartVersion: {
                        tableName: exploreId,
                        // Editing: seeded metrics fill gaps, the chart's own
                        // snapshot wins on collision.
                        metricQuery: editChart
                            ? {
                                  ...editChart.metricQuery,
                                  additionalMetrics:
                                      mergeDashboardCustomMetrics(
                                          editChart.metricQuery
                                              .additionalMetrics ?? [],
                                          seededMetrics,
                                      ),
                              }
                            : {
                                  exploreName: exploreId,
                                  dimensions: [],
                                  metrics: [],
                                  filters: {},
                                  sorts: [],
                                  limit: 500,
                                  tableCalculations: [],
                                  additionalMetrics: seededMetrics,
                                  timezone: undefined,
                              },
                        chartConfig: editChart?.chartConfig ?? {
                            type: ChartType.CARTESIAN,
                            config: {
                                layout: { xField: '', yField: [] },
                                eChartsConfig: { series: [] },
                            },
                        },
                        tableConfig: editChart?.tableConfig ?? {
                            columnOrder: [],
                        },
                        pivotConfig: editChart?.pivotConfig ?? { columns: [] },
                    },
                },
                defaultLimit: 500,
            }),
        }),
    );

    return (
        <Provider store={store}>
            <ExplorerEffects />
            <Page
                withContainerHeight
                title={data ? data.label : 'Tables'}
                sidebar={
                    <ExploreSideBar
                        onExploreClick={(explore) =>
                            onExploreSelect(explore.name)
                        }
                        onBackToTables={onBackToTables}
                    />
                }
                isSidebarOpen
                withFullHeight
                withPaddedContent
            >
                <MergeProvider savedMerge={editChart?.merge ?? null}>
                    <Explorer />
                </MergeProvider>
            </Page>
        </Provider>
    );
};

// Query effects must run inside the store Provider.
const ExplorerEffects: FC = () => {
    useExplorerQueryEffects();
    return null;
};

type Props = {
    opened: boolean;
    dashboardUuid: string;
    dashboardName: string;
    editChart?: SavedChart;
    onChartSaved: (chart: SavedChart) => void;
    onRegistryMetricEdited: (metric: AdditionalMetric) => void;
    onClose: () => void;
};

/**
 * Full-screen Explorer over a dashboard, so authors build a chart without
 * leaving the page. Modelled on the embedded dashboard's chart editor.
 */
const DashboardChartEditorModal: FC<Props> = ({
    opened,
    dashboardUuid,
    dashboardName,
    editChart,
    onChartSaved,
    onRegistryMetricEdited,
    onClose,
}) => {
    const [pickedExploreId, setPickedExploreId] = useState<string>();
    const exploreId = editChart ? editChart.tableName : pickedExploreId;

    const {
        seededMetrics,
        dashboardMetricIds,
        isLoading: isSeedLoading,
    } = useDashboardCustomMetricSeed(exploreId);

    // Saving closes the modal via the host, bypassing handleClose — reset the
    // picked explore here too so the next New chart starts at the picker.
    const handleChartSaved = useCallback(
        (chart: SavedChart) => {
            setPickedExploreId(undefined);
            onChartSaved(chart);
        },
        [onChartSaved],
    );

    const modalHostValue = useMemo(
        () => ({
            isModalHosted: true,
            onChartSaved: handleChartSaved,
            dashboard: { uuid: dashboardUuid, name: dashboardName },
            dashboardMetricIds,
            onRegistryMetricEdited,
        }),
        [
            handleChartSaved,
            dashboardUuid,
            dashboardName,
            dashboardMetricIds,
            onRegistryMetricEdited,
        ],
    );

    const handleClose = useCallback(() => {
        setPickedExploreId(undefined);
        onClose();
    }, [onClose]);

    return (
        <MantineModal
            opened={opened}
            onClose={handleClose}
            title={editChart ? 'Edit chart' : 'New chart'}
            icon={IconChartBar}
            fullScreen
            cancelLabel={false}
            modalBodyProps={{ px: 0, py: 0 }}
        >
            <ModalHostedContext.Provider value={modalHostValue}>
                {isSeedLoading ? (
                    <PageSpinner />
                ) : (
                    <DashboardChartEditorContent
                        key={`${dashboardUuid}-${exploreId ?? 'picker'}-${
                            editChart?.uuid ?? 'new'
                        }`}
                        exploreId={exploreId ?? ''}
                        editChart={editChart}
                        seededMetrics={seededMetrics}
                        onExploreSelect={setPickedExploreId}
                        onBackToTables={() => setPickedExploreId(undefined)}
                    />
                )}
            </ModalHostedContext.Provider>
        </MantineModal>
    );
};

export default DashboardChartEditorModal;
