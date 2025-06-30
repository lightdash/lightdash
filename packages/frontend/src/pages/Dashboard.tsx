import {
    ContentType,
    type DashboardTab,
    type DashboardTile,
    type Dashboard as IDashboard,
} from '@lightdash/common';
import { Box, Button, Flex, Group, Modal, Stack, Text } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { captureException, useProfiler } from '@sentry/react';
import { IconAlertCircle } from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useState, type FC } from 'react';
import { type Layout } from 'react-grid-layout';
import { useBlocker, useNavigate, useParams } from 'react-router';
import DashboardFilter from '../components/DashboardFilter';
import DashboardTabs from '../components/DashboardTabs';
import DashboardHeader from '../components/common/Dashboard/DashboardHeader';
import ErrorState from '../components/common/ErrorState';
import MantineIcon from '../components/common/MantineIcon';
import Page from '../components/common/Page/Page';
import SuboptimalState from '../components/common/SuboptimalState/SuboptimalState';
import DashboardDeleteModal from '../components/common/modal/DashboardDeleteModal';
import DashboardDuplicateModal from '../components/common/modal/DashboardDuplicateModal';
import { DashboardExportModal } from '../components/common/modal/DashboardExportModal';
import { useDashboardCommentsCheck } from '../features/comments';
import { DateZoom } from '../features/dateZoom';
import {
    appendNewTilesToBottom,
    useUpdateDashboard,
} from '../hooks/dashboard/useDashboard';
import useDashboardStorage from '../hooks/dashboard/useDashboardStorage';
import { useOrganization } from '../hooks/organization/useOrganization';
import useToaster from '../hooks/toaster/useToaster';
import { useContentAction } from '../hooks/useContent';
import { useSpaceSummaries } from '../hooks/useSpaces';
import useApp from '../providers/App/useApp';
import DashboardProvider from '../providers/Dashboard/DashboardProvider';
import useDashboardContext from '../providers/Dashboard/useDashboardContext';
import useFullscreen from '../providers/Fullscreen/useFullscreen';
import '../styles/react-grid.css';

const Dashboard: FC = () => {
    const navigate = useNavigate();
    const { projectUuid, dashboardUuid, mode, tabUuid } = useParams<{
        projectUuid: string;
        dashboardUuid: string;
        mode?: string;
        tabUuid?: string;
    }>();
    const { data: spaces } = useSpaceSummaries(projectUuid, true);

    const { clearIsEditingDashboardChart, clearDashboardStorage } =
        useDashboardStorage();

    const isDashboardLoading = useDashboardContext((c) => c.isDashboardLoading);
    const dashboard = useDashboardContext((c) => c.dashboard);
    const dashboardError = useDashboardContext((c) => c.dashboardError);
    const dashboardFilters = useDashboardContext((c) => c.dashboardFilters);
    const dashboardTemporaryFilters = useDashboardContext(
        (c) => c.dashboardTemporaryFilters,
    );
    const requiredDashboardFilters = useDashboardContext(
        (c) => c.requiredDashboardFilters,
    );
    const hasRequiredDashboardFiltersToSet =
        requiredDashboardFilters.length > 0;
    const haveFiltersChanged = useDashboardContext((c) => c.haveFiltersChanged);
    const setHaveFiltersChanged = useDashboardContext(
        (c) => c.setHaveFiltersChanged,
    );
    const dashboardTiles = useDashboardContext((c) => c.dashboardTiles);
    const setDashboardTiles = useDashboardContext((c) => c.setDashboardTiles);
    const haveTilesChanged = useDashboardContext((c) => c.haveTilesChanged);
    const setHaveTilesChanged = useDashboardContext(
        (c) => c.setHaveTilesChanged,
    );

    const haveTabsChanged = useDashboardContext((c) => c.haveTabsChanged);
    const setHaveTabsChanged = useDashboardContext((c) => c.setHaveTabsChanged);
    const dashboardTabs = useDashboardContext((c) => c.dashboardTabs);
    const setDashboardTabs = useDashboardContext((c) => c.setDashboardTabs);
    const setDashboardFilters = useDashboardContext(
        (c) => c.setDashboardFilters,
    );
    const resetDashboardFilters = useDashboardContext(
        (c) => c.resetDashboardFilters,
    );
    const setDashboardTemporaryFilters = useDashboardContext(
        (c) => c.setDashboardTemporaryFilters,
    );
    const isDateZoomDisabled = useDashboardContext((c) => c.isDateZoomDisabled);

    const hasDateZoomDisabledChanged = useMemo(() => {
        return (
            (dashboard?.config?.isDateZoomDisabled || false) !==
            isDateZoomDisabled
        );
    }, [dashboard, isDateZoomDisabled]);
    const oldestCacheTime = useDashboardContext((c) => c.oldestCacheTime);

    const {
        enabled: isFullScreenFeatureEnabled,
        isFullscreen,
        toggleFullscreen,
    } = useFullscreen();
    const { showToastError } = useToaster();

    const { data: organization } = useOrganization();
    const hasTemporaryFilters = useMemo(
        () =>
            dashboardTemporaryFilters.dimensions.length > 0 ||
            dashboardTemporaryFilters.metrics.length > 0,
        [dashboardTemporaryFilters],
    );
    const isEditMode = useMemo(() => mode === 'edit', [mode]);
    const {
        mutate,
        isSuccess,
        reset,
        isLoading: isSaving,
    } = useUpdateDashboard(dashboardUuid);

    const { mutateAsync: contentAction, isLoading: isContentActionLoading } =
        useContentAction(projectUuid);

    const [isDeleteModalOpen, deleteModalHandlers] = useDisclosure();
    const [isDuplicateModalOpen, duplicateModalHandlers] = useDisclosure();
    const [isExportDashboardModalOpen, exportDashboardModalHandlers] =
        useDisclosure();

    // tabs state
    const [activeTab, setActiveTab] = useState<DashboardTab | undefined>();
    const [addingTab, setAddingTab] = useState<boolean>(false);

    const hasDashboardTiles = dashboardTiles && dashboardTiles.length > 0;
    const tabsEnabled = dashboardTabs && dashboardTabs.length > 0;

    const defaultTab = dashboardTabs?.[0];

    useEffect(() => {
        if (isDashboardLoading) return;
        if (dashboardTiles) return;

        setDashboardTiles(dashboard?.tiles ?? []);
        setDashboardTabs(dashboard?.tabs ?? []);
        setActiveTab(
            () =>
                dashboard?.tabs.find((tab) => tab.uuid === tabUuid) ??
                dashboard?.tabs[0],
        );
    }, [
        isDashboardLoading,
        dashboard,
        dashboardTiles,
        setDashboardTiles,
        setDashboardTabs,
        setActiveTab,
        tabUuid,
    ]);

    useEffect(() => {
        if (isDashboardLoading) return;
        if (dashboardTiles === undefined) return;

        clearIsEditingDashboardChart();

        const unsavedDashboardTilesRaw = sessionStorage.getItem(
            'unsavedDashboardTiles',
        );
        if (unsavedDashboardTilesRaw) {
            sessionStorage.removeItem('unsavedDashboardTiles');

            try {
                const unsavedDashboardTiles = JSON.parse(
                    unsavedDashboardTilesRaw,
                );
                // If there are unsaved tiles, add them to the dashboard
                setDashboardTiles(unsavedDashboardTiles);

                setHaveTilesChanged(!!unsavedDashboardTiles);
            } catch {
                showToastError({
                    title: 'Error parsing chart',
                    subtitle: 'Unable to save chart in dashboard',
                });
                captureException(
                    `Error parsing chart in dashboard. Attempted to parse: ${unsavedDashboardTilesRaw} `,
                );
            }
        }

        const unsavedDashboardTabsRaw = sessionStorage.getItem('dashboardTabs');

        sessionStorage.removeItem('dashboardTabs');

        if (unsavedDashboardTabsRaw) {
            try {
                const unsavedDashboardTabs = JSON.parse(
                    unsavedDashboardTabsRaw,
                );
                setDashboardTabs(unsavedDashboardTabs);
                setHaveTabsChanged(!!unsavedDashboardTabs);
                if (activeTab === undefined) {
                    // set up the active tab to previously selected tab
                    const activeTabUuid =
                        sessionStorage.getItem('activeTabUuid');
                    setActiveTab(
                        unsavedDashboardTabs.find(
                            (tab: DashboardTab) => tab.uuid === activeTabUuid,
                        ) ?? unsavedDashboardTabs[0],
                    );
                }
            } catch {
                showToastError({
                    title: 'Error parsing tabs',
                    subtitle: 'Unable to save tabs in dashboard',
                });
                captureException(
                    `Error parsing tabs in dashboard. Attempted to parse: ${unsavedDashboardTabsRaw} `,
                );
            }
        }
    }, [
        isDashboardLoading,
        dashboardTiles,
        activeTab,
        setHaveTilesChanged,
        setDashboardTiles,
        setDashboardTabs,
        setHaveTabsChanged,
        clearIsEditingDashboardChart,
        showToastError,
    ]);

    const [gridWidth, setGridWidth] = useState(0);

    useEffect(() => {
        if (isSuccess) {
            setHaveTilesChanged(false);
            setHaveFiltersChanged(false);
            setDashboardTemporaryFilters({
                dimensions: [],
                metrics: [],
                tableCalculations: [],
            });
            reset();
            if (dashboardTabs.length > 1) {
                void navigate(
                    `/projects/${projectUuid}/dashboards/${dashboardUuid}/view/tabs/${activeTab?.uuid}`,
                    { replace: true },
                );
            } else {
                void navigate(
                    `/projects/${projectUuid}/dashboards/${dashboardUuid}/view`,
                    { replace: true },
                );
            }
        }
    }, [
        dashboardUuid,
        navigate,
        isSuccess,
        projectUuid,
        reset,
        setDashboardTemporaryFilters,
        setHaveFiltersChanged,
        setHaveTilesChanged,
        dashboardTabs,
        activeTab,
    ]);

    const handleToggleFullscreen = useCallback(async () => {
        if (!isFullScreenFeatureEnabled) return;

        const willBeFullscreen = !isFullscreen;

        if (document.fullscreenElement && !willBeFullscreen) {
            await document.exitFullscreen();
        } else if (
            document.fullscreenEnabled &&
            !document.fullscreenElement &&
            willBeFullscreen
        ) {
            await document.documentElement.requestFullscreen();
        }

        toggleFullscreen();
    }, [isFullScreenFeatureEnabled, isFullscreen, toggleFullscreen]);

    useEffect(() => {
        if (!isFullScreenFeatureEnabled) return;

        const onFullscreenChange = () => {
            if (isFullscreen && !document.fullscreenElement) {
                toggleFullscreen(false);
            } else if (!isFullscreen && document.fullscreenElement) {
                toggleFullscreen(true);
            }
        };

        document.addEventListener('fullscreenchange', onFullscreenChange);

        return () =>
            document.removeEventListener(
                'fullscreenchange',
                onFullscreenChange,
            );
    });

    const handleUpdateTiles = useCallback(
        async (layout: Layout[]) => {
            setDashboardTiles((currentDashboardTiles) =>
                currentDashboardTiles?.map((tile) => {
                    const layoutTile = layout.find(({ i }) => i === tile.uuid);
                    if (
                        layoutTile &&
                        (tile.x !== layoutTile.x ||
                            tile.y !== layoutTile.y ||
                            tile.h !== layoutTile.h ||
                            tile.w !== layoutTile.w)
                    ) {
                        return {
                            ...tile,
                            x: layoutTile.x,
                            y: layoutTile.y,
                            h: layoutTile.h,
                            w: layoutTile.w,
                        };
                    }
                    return tile;
                }),
            );

            setHaveTilesChanged(true);
        },
        [setDashboardTiles, setHaveTilesChanged],
    );

    const handleAddTiles = useCallback(
        async (tiles: IDashboard['tiles'][number][]) => {
            let newTiles = tiles;
            if (tabsEnabled) {
                newTiles = tiles.map((tile: DashboardTile) => ({
                    ...tile,
                    tabUuid: activeTab ? activeTab.uuid : defaultTab?.uuid,
                }));
                setHaveTabsChanged(true);
            }
            setDashboardTiles((currentDashboardTiles) =>
                appendNewTilesToBottom(currentDashboardTiles, newTiles),
            );

            setHaveTilesChanged(true);
        },
        [
            activeTab,
            defaultTab,
            tabsEnabled,
            setDashboardTiles,
            setHaveTilesChanged,
            setHaveTabsChanged,
        ],
    );

    const handleDeleteTile = useCallback(
        async (tile: IDashboard['tiles'][number]) => {
            setDashboardTiles((currentDashboardTiles) =>
                currentDashboardTiles?.filter(
                    (filteredTile) => filteredTile.uuid !== tile.uuid,
                ),
            );

            setHaveTilesChanged(true);
        },
        [setDashboardTiles, setHaveTilesChanged],
    );

    const handleBatchDeleteTiles = (
        tilesToDelete: IDashboard['tiles'][number][],
    ) => {
        setDashboardTiles((currentDashboardTiles) =>
            currentDashboardTiles?.filter(
                (tile) => !tilesToDelete.includes(tile),
            ),
        );
        setHaveTilesChanged(true);
    };

    const handleEditTiles = useCallback(
        (updatedTile: IDashboard['tiles'][number]) => {
            setDashboardTiles((currentDashboardTiles) =>
                currentDashboardTiles?.map((tile) =>
                    tile.uuid === updatedTile.uuid ? updatedTile : tile,
                ),
            );
            setHaveTilesChanged(true);
        },
        [setDashboardTiles, setHaveTilesChanged],
    );

    const handleCancel = useCallback(() => {
        if (!dashboard) return;

        sessionStorage.clear();

        setDashboardTiles(dashboard.tiles);
        setHaveTilesChanged(false);
        setDashboardFilters(dashboard.filters);
        setHaveFiltersChanged(false);
        setHaveTabsChanged(false);
        setDashboardTabs(dashboard.tabs);

        if (dashboardTabs.length > 0) {
            void navigate(
                `/projects/${projectUuid}/dashboards/${dashboardUuid}/view/tabs/${activeTab?.uuid}`,
                { replace: true },
            );
        } else {
            void navigate(
                `/projects/${projectUuid}/dashboards/${dashboardUuid}/view`,
                { replace: true },
            );
        }
    }, [
        dashboard,
        dashboardUuid,
        navigate,
        projectUuid,
        setDashboardTiles,
        setHaveFiltersChanged,
        setDashboardFilters,
        setHaveTilesChanged,
        setHaveTabsChanged,
        setDashboardTabs,
        dashboardTabs,
        activeTab,
    ]);

    const handleMoveDashboardToSpace = useCallback(
        async (spaceUuid: string) => {
            if (!dashboard) return;

            await contentAction({
                action: {
                    type: 'move',
                    targetSpaceUuid: spaceUuid,
                },
                item: {
                    uuid: dashboard.uuid,
                    contentType: ContentType.DASHBOARD,
                },
            });
        },
        [dashboard, contentAction],
    );

    useEffect(() => {
        const checkReload = (event: BeforeUnloadEvent) => {
            if (isEditMode && (haveTilesChanged || haveFiltersChanged)) {
                const message =
                    'You have unsaved changes to your dashboard! Are you sure you want to leave without saving?';
                event.returnValue = message;
                return message;
            }
        };
        window.addEventListener('beforeunload', checkReload);
        return () => window.removeEventListener('beforeunload', checkReload);
    }, [haveTilesChanged, haveFiltersChanged, isEditMode]);

    // Block navigating away if there are unsaved changes
    const blocker = useBlocker(({ nextLocation }) => {
        if (
            isEditMode &&
            (haveTilesChanged || haveFiltersChanged || haveTabsChanged) &&
            !nextLocation.pathname.includes(
                `/projects/${projectUuid}/dashboards/${dashboardUuid}`,
            ) &&
            // Allow user to add a new table
            !sessionStorage.getItem('unsavedDashboardTiles')
        ) {
            return true; //blocks navigation
        }
        return false; // allow navigation
    });

    const handleEnterEditMode = useCallback(() => {
        resetDashboardFilters();
        // Defer the redirect
        void Promise.resolve().then(() => {
            return navigate(
                {
                    pathname:
                        dashboardTabs.length > 0
                            ? `/projects/${projectUuid}/dashboards/${dashboardUuid}/edit/tabs/${activeTab?.uuid}`
                            : `/projects/${projectUuid}/dashboards/${dashboardUuid}/edit`,
                    search: '',
                },
                { replace: true },
            );
        });
    }, [
        projectUuid,
        dashboardUuid,
        resetDashboardFilters,
        navigate,
        activeTab?.uuid,
        dashboardTabs.length,
    ]);

    const hasTilesThatSupportFilters = useDashboardContext(
        (c) => c.hasTilesThatSupportFilters,
    );

    if (dashboardError) {
        return <ErrorState error={dashboardError.error} />;
    }
    if (dashboard === undefined) {
        return (
            <Box mt="md">
                <SuboptimalState title="Loading..." loading />
            </Box>
        );
    }

    return (
        <>
            {blocker.state === 'blocked' && (
                <Modal
                    opened
                    onClose={() => {
                        blocker.reset();
                    }}
                    title={null}
                    withCloseButton={false}
                    closeOnClickOutside={false}
                >
                    <Stack>
                        <Group noWrap spacing="xs">
                            <MantineIcon
                                icon={IconAlertCircle}
                                color="red"
                                size={50}
                            />
                            <Text fw={500}>
                                You have unsaved changes to your dashboard! Are
                                you sure you want to leave without saving?
                            </Text>
                        </Group>

                        <Group position="right">
                            <Button
                                onClick={() => {
                                    blocker.reset();
                                }}
                            >
                                Stay
                            </Button>
                            <Button
                                color="red"
                                onClick={() => {
                                    clearDashboardStorage();
                                    blocker.proceed();
                                }}
                            >
                                Leave
                            </Button>
                        </Group>
                    </Stack>
                </Modal>
            )}

            <Page
                title={dashboard.name}
                header={
                    <DashboardHeader
                        spaces={spaces}
                        dashboard={dashboard}
                        organizationUuid={organization?.organizationUuid}
                        isEditMode={isEditMode}
                        isSaving={isSaving}
                        oldestCacheTime={oldestCacheTime}
                        isFullscreen={isFullscreen}
                        activeTabUuid={activeTab?.uuid}
                        dashboardTabs={dashboardTabs}
                        isFullScreenFeatureEnabled={isFullScreenFeatureEnabled}
                        onToggleFullscreen={handleToggleFullscreen}
                        hasDashboardChanged={
                            haveTilesChanged ||
                            haveFiltersChanged ||
                            hasTemporaryFilters ||
                            haveTabsChanged ||
                            hasDateZoomDisabledChanged
                        }
                        onAddTiles={handleAddTiles}
                        onSaveDashboard={() => {
                            const dimensionFilters = [
                                ...dashboardFilters.dimensions,
                                ...dashboardTemporaryFilters.dimensions,
                            ];
                            // Reset value for required filter on save dashboard
                            const requiredFiltersWithoutValues =
                                dimensionFilters.map((filter) => {
                                    if (filter.required) {
                                        return {
                                            ...filter,
                                            disabled: true,
                                            values: [],
                                        };
                                    }
                                    return filter;
                                });

                            mutate({
                                tiles: dashboardTiles,
                                filters: {
                                    dimensions: requiredFiltersWithoutValues,
                                    metrics: [
                                        ...dashboardFilters.metrics,
                                        ...dashboardTemporaryFilters.metrics,
                                    ],
                                    tableCalculations: [
                                        ...dashboardFilters.tableCalculations,
                                        ...dashboardTemporaryFilters.tableCalculations,
                                    ],
                                },
                                name: dashboard.name,
                                tabs: dashboardTabs,
                                config: {
                                    isDateZoomDisabled,
                                },
                            });
                        }}
                        onCancel={handleCancel}
                        onMoveToSpace={handleMoveDashboardToSpace}
                        isMovingDashboardToSpace={isContentActionLoading}
                        onDuplicate={duplicateModalHandlers.open}
                        onDelete={deleteModalHandlers.open}
                        onExport={exportDashboardModalHandlers.open}
                        setAddingTab={setAddingTab}
                        onEditClicked={handleEnterEditMode}
                    />
                }
                withFullHeight={true}
            >
                <Group position="apart" align="flex-start" noWrap px={'lg'}>
                    {/* This Group will take up remaining space (and not push DateZoom) */}
                    <Group
                        position="apart"
                        align="flex-start"
                        noWrap
                        grow
                        sx={{
                            overflow: 'auto',
                        }}
                    >
                        {hasTilesThatSupportFilters && (
                            <DashboardFilter
                                isEditMode={isEditMode}
                                activeTabUuid={activeTab?.uuid}
                            />
                        )}
                    </Group>
                    {/* DateZoom section will adjust width dynamically */}
                    {hasDashboardTiles && (
                        <Box style={{ marginLeft: 'auto' }}>
                            <DateZoom isEditMode={isEditMode} />
                        </Box>
                    )}
                </Group>
                <Flex style={{ flexGrow: 1, flexDirection: 'column' }}>
                    <DashboardTabs
                        isEditMode={isEditMode}
                        hasRequiredDashboardFiltersToSet={
                            hasRequiredDashboardFiltersToSet
                        }
                        addingTab={addingTab}
                        dashboardTiles={dashboardTiles}
                        handleAddTiles={handleAddTiles}
                        handleUpdateTiles={handleUpdateTiles}
                        handleDeleteTile={handleDeleteTile}
                        handleBatchDeleteTiles={handleBatchDeleteTiles}
                        handleEditTile={handleEditTiles}
                        setGridWidth={setGridWidth}
                        activeTab={activeTab}
                        setActiveTab={setActiveTab}
                        setAddingTab={setAddingTab}
                    />
                </Flex>
                {isDeleteModalOpen && (
                    <DashboardDeleteModal
                        opened
                        uuid={dashboard.uuid}
                        onClose={deleteModalHandlers.close}
                        onConfirm={() => {
                            void navigate(
                                `/projects/${projectUuid}/dashboards`,
                                {
                                    replace: true,
                                },
                            );
                        }}
                    />
                )}
                {isExportDashboardModalOpen && (
                    <DashboardExportModal
                        opened={isExportDashboardModalOpen}
                        onClose={exportDashboardModalHandlers.close}
                        dashboard={dashboard}
                        gridWidth={gridWidth}
                    />
                )}
                {isDuplicateModalOpen && (
                    <DashboardDuplicateModal
                        opened={isDuplicateModalOpen}
                        uuid={dashboard.uuid}
                        onClose={duplicateModalHandlers.close}
                        onConfirm={duplicateModalHandlers.close}
                    />
                )}
            </Page>
        </>
    );
};

const DashboardPage: FC = () => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const { user } = useApp();
    const dashboardCommentsCheck = useDashboardCommentsCheck(user?.data);

    useProfiler('Dashboard');

    return (
        <DashboardProvider
            projectUuid={projectUuid}
            dashboardCommentsCheck={dashboardCommentsCheck}
        >
            <Dashboard />
        </DashboardProvider>
    );
};

export default DashboardPage;
