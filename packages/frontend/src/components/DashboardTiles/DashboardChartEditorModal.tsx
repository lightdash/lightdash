import {
    ChartType,
    mergeDashboardCustomMetrics,
    type AdditionalMetric,
    type DashboardCustomMetricAffectedChart,
    type SavedChart,
} from '@lightdash/common';
import { Button, Group, Text } from '@mantine/core';
import { IconAlertTriangle, IconChartBar } from '@tabler/icons-react';
import {
    useCallback,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
    type FC,
} from 'react';
import { Provider } from 'react-redux';
import {
    buildInitialExplorerState,
    createExplorerStore,
    selectActiveFields,
    selectHasUnsavedChanges,
    selectSavedChart,
    useExplorerSelector,
} from '../../features/explorer/store';
import { MergeProvider } from '../../features/mergeQuery/context/MergeContext';
import { useDashboardCustomMetricSeed } from '../../hooks/dashboard/useDashboardCustomMetricSeed';
import { useDeleteDashboardCustomMetric } from '../../hooks/dashboard/useUpdateDashboardCustomMetric';
import useToaster from '../../hooks/toaster/useToaster';
import { useExplore } from '../../hooks/useExplore';
import { useExplorerQueryEffects } from '../../hooks/useExplorerQueryEffects';
import { ExplorerSection } from '../../providers/Explorer/types';
import { ModalHostedContext } from '../../providers/Explorer/useIsModalHosted';
import MantineModal from '../common/MantineModal';
import Page from '../common/Page/Page';
import Explorer from '../Explorer';
import { useChartGalleryRightSidebar } from '../Explorer/ChartGallery/useChartGalleryRightSidebar';
import RegistryImpactPreviewModal from '../Explorer/CustomMetricModal/RegistryImpactPreviewModal';
import ExploreSideBar from '../Explorer/ExploreSideBar';
import PageSpinner from '../PageSpinner';

type ContentProps = {
    exploreId: string;
    editChart?: SavedChart;
    seededMetrics: AdditionalMetric[];
    onDirtyChange: (isDirty: boolean) => void;
    onExploreSelect: (exploreName: string) => void;
    onBackToTables: () => void;
};

const DashboardChartEditorView: FC<
    Pick<ContentProps, 'editChart' | 'onExploreSelect' | 'onBackToTables'> & {
        title: string;
    }
> = ({ editChart, onExploreSelect, onBackToTables, title }) => {
    const rightSidebarProps = useChartGalleryRightSidebar({ enabled: true });

    return (
        <Page
            withContainerHeight
            title={title}
            sidebar={
                <ExploreSideBar
                    onExploreClick={(explore) => onExploreSelect(explore.name)}
                    onBackToTables={onBackToTables}
                />
            }
            isSidebarOpen
            {...rightSidebarProps}
            withFullHeight
            withPaddedContent
        >
            <MergeProvider savedMerge={editChart?.merge ?? null}>
                <Explorer />
            </MergeProvider>
        </Page>
    );
};

const DashboardChartEditorContent: FC<ContentProps> = ({
    exploreId,
    editChart,
    seededMetrics,
    onDirtyChange,
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
            <UnsavedChangesBridge onDirtyChange={onDirtyChange} />
            <DashboardChartEditorView
                editChart={editChart}
                onExploreSelect={onExploreSelect}
                onBackToTables={onBackToTables}
                title={data ? data.label : 'Tables'}
            />
        </Provider>
    );
};

// Query effects must run inside the store Provider.
const ExplorerEffects: FC = () => {
    useExplorerQueryEffects();
    return null;
};

// Reports the session's dirty state to the host so closing can warn.
// New charts have no savedChart to diff, so any selected field counts.
const UnsavedChangesBridge: FC<{
    onDirtyChange: (isDirty: boolean) => void;
}> = ({ onDirtyChange }) => {
    const savedChart = useExplorerSelector(selectSavedChart);
    const hasUnsavedChanges = useExplorerSelector(selectHasUnsavedChanges);
    const activeFields = useExplorerSelector(selectActiveFields);
    const isDirty = savedChart ? hasUnsavedChanges : activeFields.size > 0;
    // Layout effect: the host ref must be current before the next input event
    useLayoutEffect(() => {
        onDirtyChange(isDirty);
    }, [isDirty, onDirtyChange]);
    return null;
};

type Props = {
    opened: boolean;
    dashboardUuid: string;
    dashboardName: string;
    editChart?: SavedChart;
    onChartSaved: (chart: SavedChart) => void;
    onRegistryMetricEdited: (metric: AdditionalMetric) => void;
    onRegistryMetricDeleted: (metric: AdditionalMetric) => void;
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
    onRegistryMetricDeleted,
    onClose,
}) => {
    const [pickedExploreId, setPickedExploreId] = useState<string>();
    const exploreId = editChart ? editChart.tableName : pickedExploreId;

    const {
        seededMetrics,
        dashboardMetricIds,
        isLoading: isSeedLoading,
    } = useDashboardCustomMetricSeed(exploreId);

    const { showToastSuccess, showToastError } = useToaster();
    const deleteRegistryMetric = useDeleteDashboardCustomMetric(dashboardUuid);
    const [registryDeletePreview, setRegistryDeletePreview] = useState<{
        metric: AdditionalMetric;
        affectedCharts: DashboardCustomMetricAffectedChart[];
    } | null>(null);

    const requestRegistryMetricDelete = useCallback(
        (metric: AdditionalMetric) => {
            // Dry-run feeds the impact preview before anything commits.
            deleteRegistryMetric.mutate(
                {
                    metricTable: metric.table,
                    metricName: metric.name,
                    dryRun: true,
                },
                {
                    onSuccess: (result) => {
                        setRegistryDeletePreview({
                            metric,
                            affectedCharts: result.affectedCharts,
                        });
                    },
                    onError: (error) => {
                        showToastError({
                            title: 'Failed to prepare metric removal',
                            subtitle: error.error?.message,
                        });
                    },
                },
            );
        },
        [deleteRegistryMetric, showToastError],
    );

    const handleConfirmRegistryDelete = useCallback(() => {
        if (!registryDeletePreview) return;
        const { metric } = registryDeletePreview;
        deleteRegistryMetric.mutate(
            { metricTable: metric.table, metricName: metric.name },
            {
                onSuccess: () => {
                    onRegistryMetricDeleted(metric);
                    showToastSuccess({
                        title: 'Custom metric removed from this dashboard',
                    });
                    setRegistryDeletePreview(null);
                },
                onError: (error) => {
                    showToastError({
                        title: 'Failed to remove custom metric',
                        subtitle: error.error?.message,
                    });
                },
            },
        );
    }, [
        registryDeletePreview,
        deleteRegistryMetric,
        onRegistryMetricDeleted,
        showToastSuccess,
        showToastError,
    ]);

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
            requestRegistryMetricDelete,
        }),
        [
            handleChartSaved,
            dashboardUuid,
            dashboardName,
            dashboardMetricIds,
            onRegistryMetricEdited,
            requestRegistryMetricDelete,
        ],
    );

    const isDirtyRef = useRef(false);
    const handleDirtyChange = useCallback((isDirty: boolean) => {
        isDirtyRef.current = isDirty;
    }, []);
    const [isDiscardConfirmOpen, setIsDiscardConfirmOpen] = useState(false);

    const handleClose = useCallback(() => {
        if (isDirtyRef.current) {
            setIsDiscardConfirmOpen(true);
            return;
        }
        setPickedExploreId(undefined);
        onClose();
    }, [onClose]);

    const handleDiscard = useCallback(() => {
        setIsDiscardConfirmOpen(false);
        isDirtyRef.current = false;
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
                        onDirtyChange={handleDirtyChange}
                        onExploreSelect={setPickedExploreId}
                        onBackToTables={() => setPickedExploreId(undefined)}
                    />
                )}
                <MantineModal
                    opened={isDiscardConfirmOpen}
                    onClose={() => setIsDiscardConfirmOpen(false)}
                    title="Discard chart changes?"
                    icon={IconAlertTriangle}
                    cancelLabel={false}
                    actions={
                        <Group gap="xs">
                            <Button
                                variant="default"
                                onClick={() => setIsDiscardConfirmOpen(false)}
                            >
                                Keep editing
                            </Button>
                            <Button color="red" onClick={handleDiscard}>
                                Discard changes
                            </Button>
                        </Group>
                    }
                >
                    <Text size="sm">
                        Your unsaved chart edits will be lost.
                    </Text>
                </MantineModal>
                <RegistryImpactPreviewModal
                    opened={registryDeletePreview !== null}
                    variant="delete"
                    metricLabel={
                        registryDeletePreview?.metric.label ??
                        registryDeletePreview?.metric.name ??
                        ''
                    }
                    affectedCharts={registryDeletePreview?.affectedCharts ?? []}
                    isSaving={deleteRegistryMetric.isLoading}
                    onBack={() => setRegistryDeletePreview(null)}
                    onConfirm={handleConfirmRegistryDelete}
                />
            </ModalHostedContext.Provider>
        </MantineModal>
    );
};

export default DashboardChartEditorModal;
