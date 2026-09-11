import { subject } from '@casl/ability';
import {
    canMutateVerifiedContent,
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
    IconHistory,
    IconPencil,
} from '@tabler/icons-react';
import {
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
    type FC,
} from 'react';
import { Provider } from 'react-redux';
import {
    createExplorerStore,
    explorerActions,
    selectActiveFields,
    selectHasUnsavedChanges,
    selectSavedChart,
    useExplorerDispatch,
    useExplorerSelector,
} from '../../features/explorer/store';
import { MergeProvider } from '../../features/mergeQuery/context/MergeContext';
import { useDashboardCustomMetricSeed } from '../../hooks/dashboard/useDashboardCustomMetricSeed';
import { useDeleteDashboardCustomMetric } from '../../hooks/dashboard/useUpdateDashboardCustomMetric';
import useToaster from '../../hooks/toaster/useToaster';
import { useExplore } from '../../hooks/useExplore';
import { useExplorerQueryEffects } from '../../hooks/useExplorerQueryEffects';
import { useAbilityContext } from '../../providers/Ability/useAbilityContext';
import useApp from '../../providers/App/useApp';
import { ModalHostedContext } from '../../providers/Explorer/useIsModalHosted';
import MantineIcon from '../common/MantineIcon';
import MantineModal from '../common/MantineModal';
import ChartUpdateModal from '../common/modal/ChartUpdateModal';
import Page from '../common/Page/Page';
import TruncatedText from '../common/TruncatedText';
import Explorer from '../Explorer';
import { useChartGalleryRightSidebar } from '../Explorer/ChartGallery/useChartGalleryRightSidebar';
import RegistryImpactPreviewModal from '../Explorer/CustomMetricModal/RegistryImpactPreviewModal';
import ExploreSideBar from '../Explorer/ExploreSideBar';
import PageSpinner from '../PageSpinner';
import { buildDashboardEditorInitialState } from './buildDashboardEditorInitialState';

type ChartMetadata = Pick<SavedChart, 'name' | 'description'>;
type RenamedChart = Pick<SavedChart, 'uuid' | 'name' | 'description'>;

type ContentProps = {
    exploreId: string;
    editChart?: SavedChart;
    /** Name and description saved from the header; null until renamed. */
    chartMetadata: ChartMetadata | null;
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
    chartMetadata,
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
            <SavedChartMetadataBridge metadata={chartMetadata} />
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

// Keeps the session's saved chart in step with a rename made from the header.
const SavedChartMetadataBridge: FC<{ metadata: ChartMetadata | null }> = ({
    metadata,
}) => {
    const dispatch = useExplorerDispatch();
    const savedChart = useExplorerSelector(selectSavedChart);
    useEffect(() => {
        if (!metadata || !savedChart) return;
        if (
            metadata.name === savedChart.name &&
            metadata.description === savedChart.description
        ) {
            return;
        }
        dispatch(explorerActions.setSavedChartMetadata(metadata));
    }, [metadata, savedChart, dispatch]);
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

    const ability = useAbilityContext();
    const { user } = useApp();
    // Same gate as the chart page: manage the chart, and its verification
    const canManageChart =
        editChart !== undefined &&
        ability.can('manage', subject('SavedChart', { ...editChart })) &&
        canMutateVerifiedContent(
            ability,
            {
                organizationUuid: editChart.organizationUuid,
                projectUuid: editChart.projectUuid,
            },
            editChart.verification,
            user.data?.userUuid,
        );
    // The rename dialog reports what it saved; the tile's copy in editChart
    // is otherwise the freshest source, so no cache read here.
    const [renamedChart, setRenamedChart] = useState<RenamedChart | null>(null);
    const chartMetadata = useMemo<ChartMetadata | null>(
        () =>
            renamedChart && renamedChart.uuid === editChart?.uuid
                ? {
                      name: renamedChart.name,
                      description: renamedChart.description,
                  }
                : null,
        [renamedChart, editChart?.uuid],
    );
    const chartName = chartMetadata?.name ?? editChart?.name;
    const [isRenamingChart, setIsRenamingChart] = useState(false);

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
                                {`Edit ${chartName}`}
                            </TruncatedText>
                            {dashboard && canManageChart && (
                                <Tooltip label="Edit name and description">
                                    <ActionIcon
                                        aria-label="Edit name and description"
                                        onClick={() => setIsRenamingChart(true)}
                                    >
                                        <MantineIcon icon={IconPencil} />
                                    </ActionIcon>
                                </Tooltip>
                            )}
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
                            {dashboard && canManageChart && (
                                <Tooltip label="Version history">
                                    <ActionIcon
                                        component="a"
                                        href={`/projects/${editChart.projectUuid}/saved/${editChart.uuid}/history`}
                                        target="_blank"
                                        rel="noreferrer"
                                        aria-label="Version history"
                                    >
                                        <MantineIcon icon={IconHistory} />
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
                        chartMetadata={chartMetadata}
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
                {editChart && dashboard && canManageChart && (
                    <ChartUpdateModal
                        opened={isRenamingChart}
                        uuid={editChart.uuid}
                        onClose={() => setIsRenamingChart(false)}
                        onConfirm={(chart) => {
                            setRenamedChart({
                                uuid: chart.uuid,
                                name: chart.name,
                                description: chart.description,
                            });
                            setIsRenamingChart(false);
                        }}
                    />
                )}
            </ModalHostedContext.Provider>
        </MantineModal>
    );
};

export default DashboardChartEditorModal;
