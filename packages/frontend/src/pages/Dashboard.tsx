import {
    assertUnreachable,
    Dashboard as IDashboard,
    DashboardTile,
    DashboardTileTypes,
    isDashboardChartTileType,
} from '@lightdash/common';
import { Box, Button, Group, Modal, Stack, Text } from '@mantine/core';
import { captureException, useProfiler } from '@sentry/react';
import { IconAlertCircle } from '@tabler/icons-react';
import { useFeatureFlagEnabled } from 'posthog-js/react';
import React, {
    FC,
    memo,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import { Layout, Responsive, WidthProvider } from 'react-grid-layout';
import { useHistory, useParams } from 'react-router-dom';
import { useIntersection } from 'react-use';
import DashboardHeader from '../components/common/Dashboard/DashboardHeader';
import ErrorState from '../components/common/ErrorState';
import MantineIcon from '../components/common/MantineIcon';
import DashboardDeleteModal from '../components/common/modal/DashboardDeleteModal';
import { DashboardExportModal } from '../components/common/modal/DashboardExportModal';
import Page from '../components/common/Page/Page';
import SuboptimalState from '../components/common/SuboptimalState/SuboptimalState';
import DashboardFilter from '../components/DashboardFilter';
import ChartTile from '../components/DashboardTiles/DashboardChartTile';
import LoomTile from '../components/DashboardTiles/DashboardLoomTile';
import MarkdownTile from '../components/DashboardTiles/DashboardMarkdownTile';
import EmptyStateNoTiles from '../components/DashboardTiles/EmptyStateNoTiles';
import TileBase from '../components/DashboardTiles/TileBase/index';
import { DateZoom } from '../features/dateZoom';
import {
    appendNewTilesToBottom,
    useDuplicateDashboardMutation,
    useMoveDashboardMutation,
    useUpdateDashboard,
} from '../hooks/dashboard/useDashboard';
import useDashboardStorage from '../hooks/dashboard/useDashboardStorage';
import { useOrganization } from '../hooks/organization/useOrganization';
import useToaster from '../hooks/toaster/useToaster';
import { deleteSavedQuery } from '../hooks/useSavedQuery';
import { useSpaceSummaries } from '../hooks/useSpaces';
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
    > & { isLazyLoadEnabled: boolean; index: number }
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

    const dashboard = useDashboardContext((c) => c.dashboard);
    const dashboardError = useDashboardContext((c) => c.dashboardError);
    const dashboardFilters = useDashboardContext((c) => c.dashboardFilters);
    const dashboardTemporaryFilters = useDashboardContext(
        (c) => c.dashboardTemporaryFilters,
    );
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
    const setDashboardFilters = useDashboardContext(
        (c) => c.setDashboardFilters,
    );
    const setDashboardTemporaryFilters = useDashboardContext(
        (c) => c.setDashboardTemporaryFilters,
    );
    const oldestCacheTime = useDashboardContext((c) => c.oldestCacheTime);

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
    const { mutate: duplicateDashboard } = useDuplicateDashboardMutation({
        showRedirectButton: true,
    });

    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

    const layouts = useMemo(
        () => ({
            lg:
                dashboardTiles?.map<Layout>((tile) =>
                    getReactGridLayoutConfig(tile, isEditMode),
                ) ?? [],
        }),
        [dashboardTiles, isEditMode],
    );

    const { tiles: savedTiles } = dashboard || {};
    useEffect(() => {
        if (savedTiles) {
            clearIsEditingDashboardChart();
            const unsavedDashboardTilesRaw = sessionStorage.getItem(
                'unsavedDashboardTiles',
            );
            sessionStorage.removeItem('unsavedDashboardTiles');
            if (unsavedDashboardTilesRaw) {
                try {
                    const unsavedDashboardTiles = JSON.parse(
                        unsavedDashboardTilesRaw,
                    );
                    // If there are unsaved tiles, add them to the dashboard
                    setDashboardTiles((old = []) => {
                        return [...old, ...unsavedDashboardTiles];
                    });
                    setHaveTilesChanged(!!unsavedDashboardTiles);
                } catch {
                    showToastError({
                        title: 'Error parsing chart',
                        subtitle: 'Unable to save chart in dashboard',
                    });
                    console.error(
                        'Error parsing chart in dashboard. Attempted to parse: ',
                        unsavedDashboardTilesRaw,
                    );
                    captureException(
                        `Error parsing chart in dashboard. Attempted to parse: ${unsavedDashboardTilesRaw} `,
                    );
                }
            } else {
                // If there are no dashboard tiles, set them to the saved ones
                // This is the first time the dashboard is being loaded.
                if (!dashboardTiles) {
                    setDashboardTiles(savedTiles);
                }
            }
        }
    }, [
        setHaveTilesChanged,
        setDashboardTiles,
        dashboardTiles,
        savedTiles,
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
            setDashboardTiles((currentDashboardTiles) =>
                appendNewTilesToBottom(currentDashboardTiles, tiles),
            );

            setHaveTilesChanged(true);
        },
        [setDashboardTiles, setHaveTilesChanged],
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
    ]);

    const handleMoveDashboardToSpace = (spaceUuid: string) => {
        if (!dashboard) return;

        moveDashboardToSpace({
            uuid: dashboard.uuid,
            name: dashboard.name,
            spaceUuid,
        });
    };

    const handleDuplicateDashboard = () => {
        if (!dashboard) return;
        duplicateDashboard(dashboard.uuid);
    };

    const handleDeleteDashboard = () => {
        if (!dashboard) return;
        setIsDeleteModalOpen(true);
    };

    const [isExportDashboardModalOpen, setIsExportDashboardModalOpen] =
        useState(false);

    const handleExportDashboard = () => {
        if (!dashboard) return;

        setIsExportDashboardModalOpen(true);
    };

    const [isSaveWarningModalOpen, setIsSaveWarningModalOpen] =
        useState<boolean>(false);
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
        if (isEditMode && (haveTilesChanged || haveFiltersChanged)) {
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
                    setIsSaveWarningModalOpen(true);
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
        haveFiltersChanged,
        projectUuid,
        dashboardUuid,
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

    return (
        <>
            <Modal
                opened={isSaveWarningModalOpen}
                onClose={() => setIsSaveWarningModalOpen(false)}
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
                        <Button
                            onClick={() => setIsSaveWarningModalOpen(false)}
                        >
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
                        dashboardName={dashboard.name}
                        dashboardDescription={dashboard.description}
                        dashboardUpdatedByUser={dashboard.updatedByUser}
                        dashboardUpdatedAt={dashboard.updatedAt}
                        dashboardSpaceName={dashboard.spaceName}
                        dashboardSpaceUuid={dashboard.spaceUuid}
                        dashboardViews={dashboard.views}
                        dashboardFirstViewedAt={dashboard.firstViewedAt}
                        organizationUuid={organization?.organizationUuid}
                        isEditMode={isEditMode}
                        isSaving={isSaving}
                        oldestCacheTime={oldestCacheTime}
                        hasDashboardChanged={
                            haveTilesChanged ||
                            haveFiltersChanged ||
                            hasTemporaryFilters
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
                            })
                        }
                        onCancel={handleCancel}
                        onMoveToSpace={handleMoveDashboardToSpace}
                        onDuplicate={handleDuplicateDashboard}
                        onDelete={handleDeleteDashboard}
                        onExport={handleExportDashboard}
                    />
                }
            >
                <Group position="apart" align="flex-start" noWrap>
                    {dashboardChartTiles && dashboardChartTiles.length > 0 && (
                        <DashboardFilter isEditMode={isEditMode} />
                    )}
                    {hasDashboardTiles && <DateZoom isEditMode={isEditMode} />}
                </Group>

                <ResponsiveGridLayout
                    {...getResponsiveGridLayoutProps()}
                    className="react-grid-layout-dashboard"
                    onDragStop={handleUpdateTiles}
                    onResizeStop={handleUpdateTiles}
                    onWidthChange={(cw) => setGridWidth(cw)}
                    layouts={layouts}
                >
                    {sortedTiles?.map((tile, idx) => {
                        return (
                            <div key={tile.uuid}>
                                <TrackSection name={SectionName.DASHBOARD_TILE}>
                                    <GridTile
                                        isLazyLoadEnabled={
                                            isLazyLoadEnabled ?? true
                                        }
                                        index={idx}
                                        isEditMode={isEditMode}
                                        tile={tile}
                                        onDelete={handleDeleteTile}
                                        onEdit={handleEditTiles}
                                    />
                                </TrackSection>
                            </div>
                        );
                    })}
                </ResponsiveGridLayout>

                {!hasDashboardTiles && (
                    <EmptyStateNoTiles
                        onAddTiles={handleAddTiles}
                        isEditMode={isEditMode}
                    />
                )}

                {isDeleteModalOpen && (
                    <DashboardDeleteModal
                        opened
                        uuid={dashboard.uuid}
                        onClose={() => setIsDeleteModalOpen(false)}
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
                        onClose={() => setIsExportDashboardModalOpen(false)}
                        dashboard={dashboard}
                        gridWidth={gridWidth}
                    />
                )}
            </Page>
        </>
    );
};

const DashboardPage: FC = () => {
    useProfiler('Dashboard');
    return (
        <DashboardProvider>
            <Dashboard />
        </DashboardProvider>
    );
};

export default DashboardPage;
