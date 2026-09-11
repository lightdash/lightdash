import {
    type AdditionalMetric,
    type DashboardCustomMetricAffectedChart,
    type SavedChart,
} from '@lightdash/common';
import {
    ActionIcon,
    Anchor,
    Button,
    Group,
    Text,
    Tooltip,
} from '@mantine/core';
import {
    IconAlertTriangle,
    IconChartBar,
    IconExternalLink,
} from '@tabler/icons-react';
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
import { ModalHostedContext } from '../../providers/Explorer/useIsModalHosted';
import MantineIcon from '../common/MantineIcon';
import MantineModal from '../common/MantineModal';
import Page from '../common/Page/Page';
import TruncatedText from '../common/TruncatedText';
import Explorer from '../Explorer';
import { useChartGalleryRightSidebar } from '../Explorer/ChartGallery/useChartGalleryRightSidebar';
import RegistryImpactPreviewModal from '../Explorer/CustomMetricModal/RegistryImpactPreviewModal';
import ExploreSideBar from '../Explorer/ExploreSideBar';
import PageSpinner from '../PageSpinner';
import { buildDashboardEditorInitialState } from './buildDashboardEditorInitialState';

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
            explorer: buildDashboardEditorInitialState({
                exploreId,
                editChart,
                seededMetrics,
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
    /** Null when hosted outside a dashboard (e.g. the AI agent thread view). */
    dashboard: { uuid: string; name: string } | null;
    editChart?: SavedChart;
    /** Shared-metrics layer: seed, collect, badge, registry mutations */
    customMetricsEnabled: boolean;
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
    dashboard,
    editChart,
    customMetricsEnabled,
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
    } = useDashboardCustomMetricSeed(
        customMetricsEnabled ? exploreId : undefined,
    );

    const { showToastSuccess, showToastError } = useToaster();
    const deleteRegistryMetric = useDeleteDashboardCustomMetric(
        dashboard?.uuid,
    );
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
            dashboard: dashboard ?? undefined,
            dashboardMetricIds: customMetricsEnabled
                ? dashboardMetricIds
                : undefined,
            onRegistryMetricEdited,
            requestRegistryMetricDelete,
        }),
        [
            handleChartSaved,
            dashboard,
            dashboardMetricIds,
            customMetricsEnabled,
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
            title={
                <Group gap={6} wrap="nowrap">
                    {dashboard && (
                        <>
                            <Anchor
                                c="dimmed"
                                fw={500}
                                underline="hover"
                                truncate="end"
                                maw={300}
                                onClick={handleClose}
                            >
                                {dashboard.name}
                            </Anchor>
                            <Text c="dimmed" fw={500}>
                                /
                            </Text>
                        </>
                    )}
                    {editChart ? (
                        <>
                            <TruncatedText
                                fw={600}
                                fz="md"
                                maxWidth="100%"
                                miw={0}
                            >
                                {`Edit ${editChart.name}`}
                            </TruncatedText>
                            {dashboard && (
                                <Tooltip label="Open saved chart in new tab">
                                    <ActionIcon
                                        component="a"
                                        href={`/projects/${editChart.projectUuid}/saved/${editChart.uuid}`}
                                        target="_blank"
                                        rel="noreferrer"
                                        aria-label="Open saved chart in new tab"
                                    >
                                        <MantineIcon icon={IconExternalLink} />
                                    </ActionIcon>
                                </Tooltip>
                            )}
                        </>
                    ) : (
                        <Text fw={600}>New chart</Text>
                    )}
                </Group>
            }
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
                        key={`${dashboard?.uuid ?? 'standalone'}-${
                            exploreId ?? 'picker'
                        }-${editChart?.uuid ?? 'new'}`}
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
