import {
    type AdditionalMetric,
    type DashboardCustomMetricAffectedChart,
    type SavedChart,
} from '@lightdash/common';
import { ActionIcon, Anchor, Group, Text, Tooltip } from '@mantine/core';
import { IconChartBar, IconHistory, IconPencil } from '@tabler/icons-react';
import {
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useState,
    type FC,
} from 'react';
import { Provider } from 'react-redux';
import { useNavigate } from 'react-router';
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
import { useChartPermissions } from '../../hooks/useChartPermissions';
import { useExplore } from '../../hooks/useExplore';
import { useExplorerQueryEffects } from '../../hooks/useExplorerQueryEffects';
import { useSavedQuery } from '../../hooks/useSavedQuery';
import { ModalHostedContext } from '../../providers/Explorer/useIsModalHosted';
import ChartHistoryPanel from '../ChartHistory/ChartHistoryPanel';
import MantineIcon from '../common/MantineIcon';
import MantineModal from '../common/MantineModal';
import { useMantineModalClose } from '../common/MantineModal/useMantineModalClose';
import ChartUpdateModal from '../common/modal/ChartUpdateModal';
import Page from '../common/Page/Page';
import TruncatedText from '../common/TruncatedText';
import Explorer from '../Explorer';
import { useChartGalleryRightSidebar } from '../Explorer/ChartGallery/useChartGalleryRightSidebar';
import RegistryImpactPreviewModal from '../Explorer/CustomMetricModal/RegistryImpactPreviewModal';
import ExploreSideBar from '../Explorer/ExploreSideBar';
import PageSpinner from '../PageSpinner';
import { buildDashboardEditorInitialState } from './buildDashboardEditorInitialState';
import { DashboardChartEditorActionsPortalId } from './constants';
import DashboardChartEditorHeaderActions from './DashboardChartEditorHeaderActions';

type HeaderActionHandlers = {
    onOpenChartPage: (target: { pathname: string; search: string }) => void;
    onOpenVersionHistory: () => void;
    onDeleted: () => void;
};

type ContentProps = HeaderActionHandlers & {
    exploreId: string;
    editChart?: SavedChart;
    /** The chart as the server last returned it; null until fetched. */
    chartOnServer: SavedChart | null;
    seededMetrics: AdditionalMetric[];
    onDirtyChange: (isDirty: boolean) => void;
    onExploreSelect: (exploreName: string) => void;
    onBackToTables: () => void;
};

const DashboardChartEditorView: FC<
    Pick<
        ContentProps,
        | 'editChart'
        | 'onExploreSelect'
        | 'onBackToTables'
        | 'onOpenChartPage'
        | 'onOpenVersionHistory'
        | 'onDeleted'
    > & {
        title: string;
    }
> = ({
    editChart,
    onExploreSelect,
    onBackToTables,
    onOpenChartPage,
    onOpenVersionHistory,
    onDeleted,
    title,
}) => {
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
                <DashboardChartEditorHeaderActions
                    onOpenChartPage={onOpenChartPage}
                    onOpenVersionHistory={onOpenVersionHistory}
                    onDeleted={onDeleted}
                />
                <Explorer />
            </MergeProvider>
        </Page>
    );
};

const DashboardChartEditorContent: FC<ContentProps> = ({
    exploreId,
    editChart,
    chartOnServer,
    seededMetrics,
    onDirtyChange,
    onExploreSelect,
    onBackToTables,
    onOpenChartPage,
    onOpenVersionHistory,
    onDeleted,
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
            <SavedChartMetadataBridge chart={chartOnServer} />
            <DashboardChartEditorView
                editChart={editChart}
                onExploreSelect={onExploreSelect}
                onBackToTables={onBackToTables}
                onOpenChartPage={onOpenChartPage}
                onOpenVersionHistory={onOpenVersionHistory}
                onDeleted={onDeleted}
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

// Keeps the session's saved chart in step with the server: renames, pins,
// verification and slug changes made from the header land in the cache.
const SavedChartMetadataBridge: FC<{ chart: SavedChart | null }> = ({
    chart,
}) => {
    const dispatch = useExplorerDispatch();
    const sessionChartUuid = useExplorerSelector(
        (state) => selectSavedChart(state)?.uuid,
    );
    useEffect(() => {
        if (!chart || chart.uuid !== sessionChartUuid) return;
        dispatch(explorerActions.setSavedChartMetadata(chart));
    }, [chart, sessionChartUuid, dispatch]);
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

// The breadcrumb back to the dashboard closes the editor, so it goes through
// the modal's close path and gets the same unsaved-changes confirmation.
const BackToDashboardAnchor: FC<{ name: string }> = ({ name }) => {
    const { requestClose } = useMantineModalClose();
    return (
        <Anchor
            c="dimmed"
            fw={500}
            underline="hover"
            truncate="end"
            maw={300}
            onClick={requestClose}
        >
            {name}
        </Anchor>
    );
};

type Props = {
    opened: boolean;
    /** Null when hosted outside a dashboard (e.g. the AI agent thread view). */
    dashboard: { uuid: string; name: string } | null;
    editChart?: SavedChart;
    /** Shared-metrics layer: seed, collect, badge, registry mutations */
    customMetricsEnabled: boolean;
    /**
     * Runs before the editor hands over to the chart page, so a dashboard host
     * can stash its unsaved state for the "Return to dashboard" trip back.
     */
    onBeforeOpenChartPage: () => void;
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
    onBeforeOpenChartPage,
    onChartSaved,
    onRegistryMetricEdited,
    onRegistryMetricDeleted,
    onClose,
}) => {
    const [pickedExploreId, setPickedExploreId] = useState<string>();
    const exploreId = editChart ? editChart.tableName : pickedExploreId;

    // The tile's copy opens the editor; header actions (rename, pin, verify)
    // update the cache, so the header and the session follow the cache.
    const { data: chartOnServer } = useSavedQuery({
        uuidOrSlug: editChart?.uuid,
        projectUuid: editChart?.projectUuid,
    });
    const chart =
        chartOnServer && chartOnServer.uuid === editChart?.uuid
            ? chartOnServer
            : editChart;
    // Same gate as the chart page: manage the chart, and its verification
    const { canManageChart } = useChartPermissions(chart);
    const chartName = chart?.name;
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

    // Drives the modal's own confirm-before-close, so closing with unsaved
    // edits asks first wherever the close comes from.
    const [isDirty, setIsDirty] = useState(false);
    const navigate = useNavigate();

    const closeEditor = useCallback(() => {
        setIsDirty(false);
        setPickedExploreId(undefined);
        onClose();
    }, [onClose]);

    // The same trip a tile's "Edit chart" took before the in-dashboard editor,
    // with this session's edits in the url so nothing is discarded.
    // The route change unmounts the host, so the editor is not closed first:
    // a host re-render would let the dashboard's URL sync replace this route.
    const handleOpenChartPage = useCallback(
        (target: { pathname: string; search: string }) => {
            setIsDirty(false);
            onBeforeOpenChartPage();
            void navigate(target, { viewTransition: true });
        },
        [navigate, onBeforeOpenChartPage],
    );

    // The chart no longer exists, so there is nothing left to keep editing.
    const handleDeleted = closeEditor;

    // History opens over the editor; a restore replaces the chart, so the
    // editor's edits are discarded and the host refreshes the tile.
    const [history, setHistory] = useState<{
        chart: SavedChart;
        hasUnsavedEdits: boolean;
    } | null>(null);
    const handleOpenVersionHistory = useCallback(() => {
        if (!chart) return;
        setHistory({ chart, hasUnsavedEdits: isDirty });
    }, [chart, isDirty]);
    const handleRestored = useCallback(
        (chart: SavedChart) => {
            setHistory(null);
            setIsDirty(false);
            handleChartSaved(chart);
        },
        [handleChartSaved],
    );

    return (
        <MantineModal
            opened={opened}
            onClose={closeEditor}
            confirmBeforeClose={isDirty}
            title={
                <Group gap={6} wrap="nowrap">
                    {dashboard && (
                        <>
                            <BackToDashboardAnchor name={dashboard.name} />
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
                                {chartName ?? editChart.name}
                            </TruncatedText>
                            {dashboard && canManageChart && (
                                <Tooltip label="Edit name and description">
                                    <ActionIcon
                                        size="xs"
                                        aria-label="Edit name and description"
                                        onClick={() => setIsRenamingChart(true)}
                                    >
                                        <MantineIcon icon={IconPencil} />
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
            headerActions={
                editChart ? (
                    <Group
                        id={DashboardChartEditorActionsPortalId}
                        gap="xs"
                        wrap="nowrap"
                    />
                ) : undefined
            }
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
                        chartOnServer={
                            chartOnServer &&
                            chartOnServer.uuid === editChart?.uuid
                                ? chartOnServer
                                : null
                        }
                        seededMetrics={seededMetrics}
                        onDirtyChange={setIsDirty}
                        onExploreSelect={setPickedExploreId}
                        onBackToTables={() => setPickedExploreId(undefined)}
                        onOpenChartPage={handleOpenChartPage}
                        onOpenVersionHistory={handleOpenVersionHistory}
                        onDeleted={handleDeleted}
                    />
                )}
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
                        onConfirm={() => setIsRenamingChart(false)}
                    />
                )}
            </ModalHostedContext.Provider>
            <MantineModal
                opened={history !== null}
                onClose={() => setHistory(null)}
                title="Version history"
                subtitle={chartName}
                icon={IconHistory}
                fullScreen
                cancelLabel={false}
                modalBodyProps={{ px: 0, py: 0 }}
            >
                {history && (
                    <ChartHistoryPanel
                        chart={history.chart}
                        projectUuid={history.chart.projectUuid}
                        sidebarHeader={null}
                        hasUnsavedEdits={history.hasUnsavedEdits}
                        withContainerHeight
                        onRestored={handleRestored}
                    />
                )}
            </MantineModal>
        </MantineModal>
    );
};

export default DashboardChartEditorModal;
