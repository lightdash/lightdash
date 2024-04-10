import {
    assertUnreachable,
    DashboardTileTypes,
    isDashboardChartTileType,
    type Dashboard as IDashboard,
    type DashboardTab,
    type DashboardTile,
} from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Button,
    Group,
    Modal,
    Stack,
    Tabs,
    Text,
    TextInput,
    Tooltip,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { captureException, useProfiler } from '@sentry/react';
import {
    IconAlertCircle,
    IconCheck,
    IconEdit,
    IconPlus,
    IconX,
} from '@tabler/icons-react';
import { useFeatureFlagEnabled } from 'posthog-js/react';
import React, {
    memo,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type FC,
} from 'react';
import { Responsive, WidthProvider, type Layout } from 'react-grid-layout';
import { useHistory, useParams } from 'react-router-dom';
import { useIntersection } from 'react-use';
import { v4 as uuid4 } from 'uuid';
import DashboardHeader from '../components/common/Dashboard/DashboardHeader';
import ErrorState from '../components/common/ErrorState';
import MantineIcon from '../components/common/MantineIcon';
import DashboardDeleteModal from '../components/common/modal/DashboardDeleteModal';
import DashboardDuplicateModal from '../components/common/modal/DashboardDuplicateModal';
import { DashboardExportModal } from '../components/common/modal/DashboardExportModal';
import { LockedDashboardModal } from '../components/common/modal/LockedDashboardModal';
import Page from '../components/common/Page/Page';
import SuboptimalState from '../components/common/SuboptimalState/SuboptimalState';
import DashboardFilter from '../components/DashboardFilter';
import ChartTile from '../components/DashboardTiles/DashboardChartTile';
import LoomTile from '../components/DashboardTiles/DashboardLoomTile';
import MarkdownTile from '../components/DashboardTiles/DashboardMarkdownTile';
import EmptyStateNoTiles from '../components/DashboardTiles/EmptyStateNoTiles';
import TileBase from '../components/DashboardTiles/TileBase/index';
import { useDashboardCommentsCheck } from '../features/comments';
import { DateZoom } from '../features/dateZoom';
import {
    appendNewTilesToBottom,
    useMoveDashboardMutation,
    useUpdateDashboard,
} from '../hooks/dashboard/useDashboard';
import useDashboardStorage from '../hooks/dashboard/useDashboardStorage';
import { useOrganization } from '../hooks/organization/useOrganization';
import useToaster from '../hooks/toaster/useToaster';
import { deleteSavedQuery } from '../hooks/useSavedQuery';
import { useSpaceSummaries } from '../hooks/useSpaces';
import { useApp } from '../providers/AppProvider';
import {
    DashboardProvider,
    useDashboardContext,
} from '../providers/DashboardProvider';
import { TrackSection } from '../providers/TrackingProvider';
import '../styles/react-grid.css';
import { SectionName } from '../types/Events';

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

export const getResponsiveGridLayoutProps = (enableAnimation = true) => ({
    draggableCancel: '.non-draggable',
    useCSSTransforms: enableAnimation,
    measureBeforeMount: !enableAnimation,
    breakpoints: { lg: 1200, md: 996, sm: 768 },
    cols: { lg: 36, md: 30, sm: 18 },
    rowHeight: 50,
});

const ResponsiveGridLayout = WidthProvider(Responsive);

const GridTile: FC<
    Pick<
        React.ComponentProps<typeof TileBase>,
        'tile' | 'onEdit' | 'onDelete' | 'isEditMode'
    > & {
        isLazyLoadEnabled: boolean;
        index: number;
        tabs?: DashboardTab[];
        onAddTiles: (tiles: IDashboard['tiles'][number][]) => Promise<void>;
        locked: boolean;
    }
> = memo((props) => {
    const { tile, isLazyLoadEnabled, index } = props;
    useProfiler(`Dashboard-${tile.type}`);
    const [isTiledViewed, setIsTiledViewed] = useState(false);
    const ref = useRef(null);
    const intersection = useIntersection(ref, {
        root: null,
        threshold: 0.3,
    });
    useEffect(() => {
        if (intersection?.isIntersecting) {
            setIsTiledViewed(true);
        }
    }, [intersection]);

    if (isLazyLoadEnabled && !isTiledViewed) {
        setTimeout(() => {
            setIsTiledViewed(true);
            // Prefetch tile sequentially, even if it's not in view
        }, index * 1000);
        return (
            <Box ref={ref} h="100%">
                <TileBase isLoading {...props} title={''} />
            </Box>
        );
    }

    if (props.locked) {
        return (
            <Box ref={ref} h="100%">
                <TileBase isLoading={false} title={''} {...props} />
            </Box>
        );
    }

    switch (tile.type) {
        case DashboardTileTypes.SAVED_CHART:
            return <ChartTile {...props} tile={tile} />;
        case DashboardTileTypes.MARKDOWN:
            return <MarkdownTile {...props} tile={tile} />;
        case DashboardTileTypes.LOOM:
            return <LoomTile {...props} tile={tile} />;
        default: {
            return assertUnreachable(
                tile,
                `Dashboard tile type "${props.tile.type}" not recognised`,
            );
        }
    }
});

const Dashboard: FC = () => {
    const isLazyLoadFeatureFlagEnabled = useFeatureFlagEnabled(
        'lazy-load-dashboard-tiles',
    );
    const isLazyLoadEnabled =
        !!isLazyLoadFeatureFlagEnabled && !(window as any).Cypress; // disable lazy load for e2e test
    const history = useHistory();
    const { projectUuid, dashboardUuid, mode } = useParams<{
        projectUuid: string;
        dashboardUuid: string;
        mode?: string;
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
    const tabs = useDashboardContext((c) => c.tabs);
    const setTabs = useDashboardContext((c) => c.setTabs);
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

    // tabs state
    const [addingTab, setAddingTab] = useState<boolean>(false);
    const [isEditingTabs, setEditingTabs] = useState<boolean>(false);
    const [activeTab, setActiveTab] = useState<DashboardTab>();

    const defaultTabUuid = useMemo(() => {
        if (tabs && tabs.length > 0) {
            return tabs[0].uuid;
        }
        return undefined;
    }, [tabs]);

    const layouts = useMemo(
        () => ({
            lg:
                dashboardTiles?.map<Layout>((tile) =>
                    getReactGridLayoutConfig(tile, isEditMode),
                ) ?? [],
        }),
        [dashboardTiles, isEditMode],
    );

    useEffect(() => {
        if (isDashboardLoading) return;
        if (dashboardTiles) return;

        setDashboardTiles(dashboard?.tiles ?? []);
        setTabs(dashboard?.tabs ?? []);
    }, [
        isDashboardLoading,
        dashboard,
        dashboardTiles,
        setDashboardTiles,
        setTabs,
    ]);

    useEffect(() => {
        if (isDashboardLoading) return;
        if (dashboardTiles === undefined) return;

        clearIsEditingDashboardChart();

        const unsavedDashboardTilesRaw = sessionStorage.getItem(
            'unsavedDashboardTiles',
        );
        if (!unsavedDashboardTilesRaw) return;

        sessionStorage.removeItem('unsavedDashboardTiles');

        try {
            const unsavedDashboardTiles = JSON.parse(unsavedDashboardTilesRaw);
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
    }, [
        isDashboardLoading,
        dashboardTiles,
        setHaveTilesChanged,
        setDashboardTiles,
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
            history.replace(
                `/projects/${projectUuid}/dashboards/${dashboardUuid}/view`,
            );
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
            if (activeTab?.uuid) {
                newTiles = tiles.map((tile: DashboardTile) => ({
                    ...tile,
                    tabUuid: activeTab?.uuid,
                }));
                setHaveTabsChanged(true);
            }
            setDashboardTiles((currentDashboardTiles) =>
                appendNewTilesToBottom(currentDashboardTiles, newTiles),
            );

            setHaveTilesChanged(true);
        },
        [activeTab, setDashboardTiles, setHaveTilesChanged, setHaveTabsChanged],
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
        setTabs(dashboard?.tabs || []);
        history.replace(
            `/projects/${projectUuid}/dashboards/${dashboardUuid}/view`,
        );
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
        setTabs,
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

    const sortedTiles = dashboardTiles?.sort((a, b) => {
        if (a.y === b.y) {
            // If 'y' is the same, sort by 'x'
            return a.x - b.x;
        } else {
            // Otherwise, sort by 'y'
            return a.y - b.y;
        }
    });

    const hasDashboardTiles = dashboardTiles && dashboardTiles.length > 0;

    const currentTabHasTiles = sortedTiles?.some((tile) => {
        return (
            tile.tabUuid === activeTab?.uuid ||
            (!tile.tabUuid && activeTab?.uuid === defaultTabUuid) ||
            (tile.tabUuid && !tabs.find((t) => t.uuid === tile.tabUuid))
        );
    });

    const handleAddTab = (name: string) => {
        if (name) {
            const newTab = { uuid: uuid4(), name: name };
            setTabs((currentTabs) => [...currentTabs, newTab]);
            setActiveTab(newTab);
            setHaveTabsChanged(true);
        }
        setAddingTab(false);
    };

    const handleEditTab = (name: string, changedTabUuid: string) => {
        if (name && changedTabUuid) {
            setTabs((currentTabs) => {
                const newTabs: DashboardTab[] = currentTabs.map((tab) => {
                    if (tab.uuid === changedTabUuid) {
                        return { ...tab, name };
                    }
                    return tab;
                });
                return newTabs;
            });
            setHaveTabsChanged(true);
        }
    };

    const handleDeleteTab = (tabUuid: string) => {
        setTabs((currentTabs) => {
            const newTabs: DashboardTab[] = currentTabs.filter(
                (tab) => tab.uuid !== tabUuid,
            );
            return newTabs;
        });
        setActiveTab(tabs[0]);
        setHaveTabsChanged(true);
    };

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
                        onToggleFullscreen={handleToggleFullscreen}
                        hasDashboardChanged={
                            haveTilesChanged ||
                            haveFiltersChanged ||
                            hasTemporaryFilters ||
                            haveTabsChanged
                        }
                        onAddTiles={handleAddTiles}
                        onSaveDashboard={() =>
                            mutate({
                                tiles: dashboardTiles,
                                filters: {
                                    dimensions: [
                                        ...dashboardFilters.dimensions,
                                        ...dashboardTemporaryFilters.dimensions,
                                    ],
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
                                tabs: tabs,
                            })
                        }
                        onCancel={handleCancel}
                        onMoveToSpace={handleMoveDashboardToSpace}
                        onDuplicate={duplicateModalHandlers.open}
                        onDelete={deleteModalHandlers.open}
                        onExport={exportDashboardModalHandlers.open}
                    />
                }
            >
                <Group position="apart" align="flex-start" noWrap>
                    {dashboardChartTiles && dashboardChartTiles.length > 0 && (
                        <DashboardFilter isEditMode={isEditMode} />
                    )}
                    {hasDashboardTiles && <DateZoom isEditMode={isEditMode} />}
                </Group>

                <Tabs
                    value={activeTab?.uuid}
                    onTabChange={(e) => {
                        const tab = tabs.find((t) => t.uuid === e);
                        setActiveTab(tab);
                    }}
                >
                    <Group
                        w="100%"
                        noWrap
                        position="apart"
                        spacing="xs"
                        style={
                            (tabs && tabs.length > 0) || isEditMode
                                ? {
                                      background: 'white',
                                      padding: 5,
                                      borderRadius: 3,
                                  }
                                : undefined
                        }
                    >
                        <Group>
                            {tabs && tabs.length > 0 && (
                                <Group spacing="xs">
                                    {isEditingTabs && isEditMode ? (
                                        <>
                                            {tabs.map((tab, idx) => {
                                                return (
                                                    <Group
                                                        key={idx}
                                                        spacing="xxs"
                                                    >
                                                        <TextInput
                                                            key={idx}
                                                            size="xs"
                                                            defaultValue={
                                                                tab.name
                                                            }
                                                            onBlur={(e) =>
                                                                handleEditTab(
                                                                    e.target
                                                                        .value,
                                                                    tab.uuid,
                                                                )
                                                            }
                                                        />
                                                        <Tooltip
                                                            label="Delete tab - Contents will move to the first tab"
                                                            multiline
                                                        >
                                                            <ActionIcon
                                                                variant="subtle"
                                                                onClick={() =>
                                                                    handleDeleteTab(
                                                                        tab.uuid,
                                                                    )
                                                                }
                                                            >
                                                                <MantineIcon
                                                                    icon={IconX}
                                                                />
                                                            </ActionIcon>
                                                        </Tooltip>
                                                    </Group>
                                                );
                                            })}
                                        </>
                                    ) : (
                                        <Tabs.List>
                                            {tabs.map((tab, idx) => {
                                                return (
                                                    <Tabs.Tab
                                                        key={idx}
                                                        value={tab.uuid}
                                                        mx="md"
                                                    >
                                                        {tab.name}
                                                    </Tabs.Tab>
                                                );
                                            })}
                                        </Tabs.List>
                                    )}
                                </Group>
                            )}
                            {isEditMode && (
                                <Group>
                                    {addingTab && (
                                        <TextInput
                                            autoFocus
                                            size="xs"
                                            placeholder="Tab name"
                                            onBlur={(e) =>
                                                handleAddTab(e.target.value)
                                            }
                                        />
                                    )}
                                    {tabs.length === 0 ? (
                                        <Button
                                            compact
                                            variant="light"
                                            disabled={addingTab}
                                            leftIcon={
                                                <MantineIcon icon={IconPlus} />
                                            }
                                            onClick={() => setAddingTab(true)}
                                        >
                                            Add tab
                                        </Button>
                                    ) : (
                                        <ActionIcon
                                            onClick={() => setAddingTab(true)}
                                            color="blue"
                                            variant="subtle"
                                            disabled={addingTab}
                                        >
                                            <MantineIcon icon={IconPlus} />
                                        </ActionIcon>
                                    )}
                                </Group>
                            )}
                        </Group>
                        {tabs && tabs.length > 0 && isEditMode && (
                            <Button
                                compact
                                variant="subtle"
                                disabled={addingTab}
                                leftIcon={
                                    <MantineIcon
                                        icon={
                                            isEditingTabs ? IconCheck : IconEdit
                                        }
                                    />
                                }
                                onClick={() => setEditingTabs((old) => !old)}
                                sx={{ justifySelf: 'end' }}
                            >
                                {isEditingTabs ? 'Done editing' : `Edit tabs`}
                            </Button>
                        )}
                    </Group>
                    <ResponsiveGridLayout
                        {...getResponsiveGridLayoutProps()}
                        className={`react-grid-layout-dashboard ${
                            hasRequiredDashboardFiltersToSet ? 'locked' : ''
                        }`}
                        onDragStop={handleUpdateTiles}
                        onResizeStop={handleUpdateTiles}
                        onWidthChange={(cw) => setGridWidth(cw)}
                        layouts={layouts}
                        key={activeTab?.uuid ?? defaultTabUuid}
                    >
                        {sortedTiles?.map((tile, idx) => {
                            // TODO: refactor this
                            if (
                                !activeTab || // If no active tab
                                tile.tabUuid === activeTab?.uuid || // Or the tile uuid matches the active tab
                                (!tile.tabUuid && // Or the tile has no tab and the active tab is the default tab
                                    activeTab?.uuid === defaultTabUuid) ||
                                (tile.tabUuid && // Or the tile has an ID that doesn't exist
                                    !tabs.find((t) => t.uuid === tile.tabUuid))
                            ) {
                                return (
                                    <div key={tile.uuid}>
                                        <TrackSection
                                            name={SectionName.DASHBOARD_TILE}
                                        >
                                            <GridTile
                                                locked={
                                                    hasRequiredDashboardFiltersToSet
                                                }
                                                isLazyLoadEnabled={
                                                    isLazyLoadEnabled ?? true
                                                }
                                                index={idx}
                                                isEditMode={isEditMode}
                                                tile={tile}
                                                onDelete={handleDeleteTile}
                                                onEdit={handleEditTiles}
                                                tabs={tabs}
                                                onAddTiles={handleAddTiles}
                                            />
                                        </TrackSection>
                                    </div>
                                );
                            }
                        })}
                    </ResponsiveGridLayout>

                    <LockedDashboardModal
                        opened={
                            hasRequiredDashboardFiltersToSet &&
                            !!hasDashboardTiles
                        }
                    />
                    {(!hasDashboardTiles || !currentTabHasTiles) && (
                        <EmptyStateNoTiles
                            onAddTiles={handleAddTiles}
                            emptyContainerType={
                                tabs && tabs.length ? 'tab' : 'dashboard'
                            }
                            isEditMode={isEditMode}
                        />
                    )}
                </Tabs>
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
