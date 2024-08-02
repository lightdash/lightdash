import {
    DashboardTileTypes,
    isDashboardChartTileType,
    ResourceViewItemType,
    type Dashboard as IDashboard,
    type DashboardTab,
    type DashboardTile,
} from '@lightdash/common';
import { Box, Button, Group, Modal, Stack, Text } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { captureException, useProfiler } from '@sentry/react';
import { IconAlertCircle } from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useState, type FC } from 'react';
import { type Layout } from 'react-grid-layout';
import { useHistory, useParams } from 'react-router-dom';
import DashboardHeader from '../components/common/Dashboard/DashboardHeader';
import ErrorState from '../components/common/ErrorState';
import MantineIcon from '../components/common/MantineIcon';
import DashboardDeleteModal from '../components/common/modal/DashboardDeleteModal';
import DashboardDuplicateModal from '../components/common/modal/DashboardDuplicateModal';
import { DashboardExportModal } from '../components/common/modal/DashboardExportModal';
import Page from '../components/common/Page/Page';
import SuboptimalState from '../components/common/SuboptimalState/SuboptimalState';
import DashboardFilter from '../components/DashboardFilter';
import DashboardTabs from '../components/DashboardTabs';
import { useDashboardCommentsCheck } from '../features/comments';
import { DateZoom } from '../features/dateZoom';
import {
    appendNewTilesToBottom,
    useMoveDashboardMutation,
    useUpdateDashboard,
} from '../hooks/dashboard/useDashboard';
import useDashboardStorage from '../hooks/dashboard/useDashboardStorage';
import { useOrganization } from '../hooks/organization/useOrganization';
import { useDashboardPinningMutation } from '../hooks/pinning/useDashboardPinningMutation';
import { usePinnedItems } from '../hooks/pinning/usePinnedItems';
import useToaster from '../hooks/toaster/useToaster';
import { deleteSavedQuery } from '../hooks/useSavedQuery';
import { useSpaceSummaries } from '../hooks/useSpaces';
import { useApp } from '../providers/AppProvider';
import {
    DashboardProvider,
    useDashboardContext,
} from '../providers/DashboardProvider';
import '../styles/react-grid.css';

export const getReactGridLayoutConfig = (
    tile: DashboardTile,
    isEditMode = false,
): Layout => ({
    minH: 1,
    minW: 6,
    x: tile.x,
    y: tile.y,
    w: tile.w,
    h: tile.h,
    i: tile.uuid,
    isDraggable: isEditMode,
    isResizable: isEditMode,
});

export const getResponsiveGridLayoutProps = ({
    enableAnimation = false,
    stackVerticallyOnSmallestBreakpoint = false,
}: {
    enableAnimation?: boolean;

    /**
     * If enabled, we set the grid on the smallest breakpoint to have a single
     * column, which makes it behave like a simple vertical stack on mobile
     * viewports.
     */
    stackVerticallyOnSmallestBreakpoint?: boolean;
} = {}) => ({
    draggableCancel: '.non-draggable',
    useCSSTransforms: enableAnimation,
    measureBeforeMount: !enableAnimation,
    breakpoints: { lg: 1200, md: 996, sm: 768 },
    cols: { lg: 36, md: 30, sm: stackVerticallyOnSmallestBreakpoint ? 1 : 18 },
    rowHeight: 50,
});

const Dashboard: FC = () => {
    const history = useHistory();
    const { projectUuid, dashboardUuid, mode, tabUuid } = useParams<{
        projectUuid: string;
        dashboardUuid: string;
        mode?: string;
        tabUuid?: string;
    }>();
    const { data: spaces } = useSpaceSummaries(projectUuid);

    const { clearIsEditingDashboardChart } = useDashboardStorage();

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
    const setDashboardTemporaryFilters = useDashboardContext(
        (c) => c.setDashboardTemporaryFilters,
    );
    const oldestCacheTime = useDashboardContext((c) => c.oldestCacheTime);

    const { isFullscreen, toggleFullscreen } = useApp();
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
    const { mutate: moveDashboardToSpace } = useMoveDashboardMutation();

    const [isDeleteModalOpen, deleteModalHandlers] = useDisclosure();
    const [isDuplicateModalOpen, duplicateModalHandlers] = useDisclosure();
    const [isExportDashboardModalOpen, exportDashboardModalHandlers] =
        useDisclosure();
    const [isSaveWarningModalOpen, saveWarningModalHandlers] = useDisclosure();
    const { mutate: toggleDashboardPinning } = useDashboardPinningMutation();
    const { data: pinnedItems } = usePinnedItems(
        projectUuid,
        dashboard?.pinnedListUuid ?? undefined,
    );

    const handleDashboardPinning = useCallback(() => {
        toggleDashboardPinning({ uuid: dashboardUuid });
    }, [dashboardUuid, toggleDashboardPinning]);

    const isPinned = useMemo(() => {
        return Boolean(
            pinnedItems?.some(
                (item) =>
                    item.type === ResourceViewItemType.DASHBOARD &&
                    item.data.uuid === dashboardUuid,
            ),
        );
    }, [dashboardUuid, pinnedItems]);

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
            if (dashboardTabs.length > 0) {
                history.replace(
                    `/projects/${projectUuid}/dashboards/${dashboardUuid}/view/tabs/${activeTab?.uuid}`,
                );
            } else {
                history.replace(
                    `/projects/${projectUuid}/dashboards/${dashboardUuid}/view/`,
                );
            }
        }
    }, [
        dashboardUuid,
        history,
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
    }, [isFullscreen, toggleFullscreen]);

    useEffect(() => {
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
        sessionStorage.clear();

        // Delete charts that were created in edit mode
        dashboardTiles?.forEach((tile) => {
            if (
                isDashboardChartTileType(tile) &&
                tile.properties.belongsToDashboard &&
                tile.properties.savedChartUuid
            ) {
                const isChartNew =
                    (dashboard?.tiles || []).find(
                        (t) =>
                            isDashboardChartTileType(t) &&
                            t.properties.savedChartUuid ===
                                tile.properties.savedChartUuid,
                    ) === undefined;

                if (isChartNew) {
                    deleteSavedQuery(tile.properties.savedChartUuid).catch(
                        () => {
                            //ignore error
                        },
                    );
                }
            }
        });

        setDashboardTiles(dashboard?.tiles || []);
        setHaveTilesChanged(false);
        if (dashboard) setDashboardFilters(dashboard.filters);
        setHaveFiltersChanged(false);
        setHaveTabsChanged(false);
        setDashboardTabs(dashboard?.tabs || []);
        if (dashboardTabs.length > 0) {
            history.replace(
                `/projects/${projectUuid}/dashboards/${dashboardUuid}/view/tabs/${activeTab?.uuid}`,
            );
        } else {
            history.replace(
                `/projects/${projectUuid}/dashboards/${dashboardUuid}/view/`,
            );
        }
    }, [
        dashboard,
        dashboardUuid,
        history,
        projectUuid,
        dashboardTiles,
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
        (spaceUuid: string) => {
            if (!dashboard) return;

            moveDashboardToSpace({
                uuid: dashboard.uuid,
                name: dashboard.name,
                spaceUuid,
            });
        },
        [dashboard, moveDashboardToSpace],
    );

    const [blockedNavigationLocation, setBlockedNavigationLocation] =
        useState<string>();

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

    useEffect(() => {
        // Check if in edit mode and changes have been made
        if (
            isEditMode &&
            (haveTilesChanged || haveFiltersChanged || haveTabsChanged)
        ) {
            // Define the navigation block function
            const navigationBlockFunction = (prompt: { pathname: string }) => {
                // Check if the user is navigating away from the current dashboard
                if (
                    !prompt.pathname.includes(
                        `/projects/${projectUuid}/dashboards/${dashboardUuid}`,
                    ) &&
                    // Allow user to add a new table
                    !sessionStorage.getItem('unsavedDashboardTiles')
                ) {
                    // Set the blocked navigation location to navigate on confirming from user
                    setBlockedNavigationLocation(prompt.pathname);
                    // Open a warning modal before blocking navigation
                    saveWarningModalHandlers.open();
                    // Return false to block history navigation
                    return false;
                }
                // Allow history navigation
                return undefined;
            };

            // Set up navigation blocking
            const unblockNavigation = history.block(navigationBlockFunction);

            // Clean up navigation blocking when the component unmounts
            return () => {
                unblockNavigation();
            };
        }
    }, [
        isEditMode,
        history,
        haveTilesChanged,
        saveWarningModalHandlers,
        haveFiltersChanged,
        projectUuid,
        dashboardUuid,
        haveTabsChanged,
    ]);

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
    const dashboardChartTiles = dashboardTiles?.filter(
        (tile) => tile.type === DashboardTileTypes.SAVED_CHART,
    );

    return (
        <>
            <Modal
                opened={isSaveWarningModalOpen}
                onClose={saveWarningModalHandlers.close}
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
                            You have unsaved changes to your dashboard! Are you
                            sure you want to leave without saving?
                        </Text>
                    </Group>

                    <Group position="right">
                        <Button onClick={saveWarningModalHandlers.close}>
                            Stay
                        </Button>
                        <Button
                            color="red"
                            onClick={() => {
                                history.block(() => {});
                                if (blockedNavigationLocation)
                                    history.push(blockedNavigationLocation);
                            }}
                        >
                            Leave
                        </Button>
                    </Group>
                </Stack>
            </Modal>

            <Page
                withPaddedContent
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
                        isPinned={isPinned}
                        activeTabUuid={activeTab?.uuid}
                        dashboardTabs={dashboardTabs}
                        onToggleFullscreen={handleToggleFullscreen}
                        hasDashboardChanged={
                            haveTilesChanged ||
                            haveFiltersChanged ||
                            hasTemporaryFilters ||
                            haveTabsChanged
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
                            });
                        }}
                        onCancel={handleCancel}
                        onMoveToSpace={handleMoveDashboardToSpace}
                        onDuplicate={duplicateModalHandlers.open}
                        onDelete={deleteModalHandlers.open}
                        onExport={exportDashboardModalHandlers.open}
                        setAddingTab={setAddingTab}
                        onTogglePin={handleDashboardPinning}
                    />
                }
            >
                <Group position="apart" align="flex-start" noWrap>
                    {dashboardChartTiles && dashboardChartTiles.length > 0 && (
                        <DashboardFilter
                            isEditMode={isEditMode}
                            activeTabUuid={activeTab?.uuid}
                        />
                    )}
                    {hasDashboardTiles && <DateZoom isEditMode={isEditMode} />}
                </Group>
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
                {isDeleteModalOpen && (
                    <DashboardDeleteModal
                        opened
                        uuid={dashboard.uuid}
                        onClose={deleteModalHandlers.close}
                        onConfirm={() => {
                            history.replace(
                                `/projects/${projectUuid}/dashboards`,
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
