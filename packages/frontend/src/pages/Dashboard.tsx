import { Alert, Intent, NonIdealState, Spinner } from '@blueprintjs/core';
import {
    assertUnreachable,
    Dashboard as IDashboard,
    DashboardTile,
    DashboardTileTypes,
} from '@lightdash/common';
import { useProfiler } from '@sentry/react';
import React, {
    FC,
    memo,
    useCallback,
    useEffect,
    useMemo,
    useState,
} from 'react';
import { Layout, Responsive, WidthProvider } from 'react-grid-layout';
import { useHistory, useParams } from 'react-router-dom';

import DashboardHeader from '../components/common/Dashboard/DashboardHeader';
import ErrorState from '../components/common/ErrorState';
import DashboardDeleteModal from '../components/common/modal/DashboardDeleteModal';
import Page from '../components/common/Page/Page';
import DashboardFilter from '../components/DashboardFilter';
import ChartTile from '../components/DashboardTiles/DashboardChartTile';
import LoomTile from '../components/DashboardTiles/DashboardLoomTile';
import MarkdownTile from '../components/DashboardTiles/DashboardMarkdownTile';
import EmptyStateNoTiles from '../components/DashboardTiles/EmptyStateNoTiles';
import TileBase from '../components/DashboardTiles/TileBase/index';
import DrillDownModal from '../components/MetricQueryData/DrillDownModal';
import MetricQueryDataProvider from '../components/MetricQueryData/MetricQueryDataProvider';
import UnderlyingDataModal from '../components/MetricQueryData/UnderlyingDataModal';
import {
    appendNewTilesToBottom,
    useDuplicateDashboardMutation,
    useExportDashboard,
    useMoveDashboardMutation,
    useUpdateDashboard,
} from '../hooks/dashboard/useDashboard';
import { useSavedQuery } from '../hooks/useSavedQuery';
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

export const RESPONSIVE_GRID_LAYOUT_PROPS = {
    draggableCancel: '.non-draggable',
    useCSSTransforms: false,
    breakpoints: { lg: 1200, md: 996, sm: 768 },
    cols: { lg: 36, md: 30, sm: 18 },
    rowHeight: 50,
};

const ResponsiveGridLayout = WidthProvider(Responsive);

const GridTile: FC<
    Pick<
        React.ComponentProps<typeof TileBase>,
        'tile' | 'onEdit' | 'onDelete' | 'isEditMode'
    >
> = memo((props) => {
    const { tile } = props;

    useProfiler(`Dashboard-${tile.type}`);

    const savedChartUuid: string | undefined =
        tile.type === DashboardTileTypes.SAVED_CHART
            ? tile.properties?.savedChartUuid || undefined
            : undefined;
    const {
        data: savedQuery,
        isLoading,
        isError,
    } = useSavedQuery({
        id: savedChartUuid,
    });

    switch (tile.type) {
        case DashboardTileTypes.SAVED_CHART:
            if (isLoading)
                return <TileBase isLoading={true} title={''} {...props} />;
            if (isError)
                return (
                    <TileBase title={''} {...props}>
                        <NonIdealState
                            icon="lock"
                            title={`You don't have access to view this chart`}
                        ></NonIdealState>
                    </TileBase>
                );
            return (
                <MetricQueryDataProvider
                    metricQuery={savedQuery?.metricQuery}
                    tableName={savedQuery?.tableName || ''}
                >
                    <ChartTile {...props} tile={tile} />
                    <UnderlyingDataModal />
                    <DrillDownModal />
                </MetricQueryDataProvider>
            );
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
    const history = useHistory();
    const { projectUuid, dashboardUuid, mode } = useParams<{
        projectUuid: string;
        dashboardUuid: string;
        mode?: string;
    }>();
    const { data: spaces } = useSpaceSummaries(projectUuid);

    const {
        dashboard,
        dashboardError,
        dashboardFilters,
        dashboardTemporaryFilters,
        haveFiltersChanged,
        setHaveFiltersChanged,
        dashboardTiles,
        setDashboardTiles,
        haveTilesChanged,
        setHaveTilesChanged,
        setDashboardFilters,
        setDashboardTemporaryFilters,
    } = useDashboardContext();
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
    const { mutate: exportDashboard } = useExportDashboard();

    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

    const layouts = useMemo(
        () => ({
            lg: dashboardTiles.map<Layout>((tile) =>
                getReactGridLayoutConfig(tile, isEditMode),
            ),
        }),
        [dashboardTiles, isEditMode],
    );

    const { tiles: savedTiles } = dashboard || {};
    useEffect(() => {
        if (savedTiles) {
            const unsavedDashboardTilesRaw = sessionStorage.getItem(
                'unsavedDashboardTiles',
            );
            sessionStorage.removeItem('unsavedDashboardTiles');
            let unsavedDashboardTiles = undefined;
            if (unsavedDashboardTilesRaw) {
                try {
                    unsavedDashboardTiles = JSON.parse(
                        unsavedDashboardTilesRaw,
                    );
                } catch {
                    // do nothing
                }
            }
            setDashboardTiles(unsavedDashboardTiles || savedTiles);
            setHaveTilesChanged(!!unsavedDashboardTiles);
        }
    }, [setHaveTilesChanged, setDashboardTiles, savedTiles]);

    useEffect(() => {
        if (isSuccess) {
            setHaveTilesChanged(false);
            setHaveFiltersChanged(false);
            setDashboardTemporaryFilters({ dimensions: [], metrics: [] });
            reset();
            history.push(
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
                currentDashboardTiles.map((tile) => {
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
            setDashboardTiles((currentDashboardTiles) => {
                return appendNewTilesToBottom(currentDashboardTiles, tiles);
            });

            setHaveTilesChanged(true);
        },
        [setDashboardTiles, setHaveTilesChanged],
    );

    const handleDeleteTile = useCallback(
        async (tile: IDashboard['tiles'][number]) => {
            setDashboardTiles((currentDashboardTiles) =>
                currentDashboardTiles.filter(
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
                currentDashboardTiles.map((tile) =>
                    tile.uuid === updatedTile.uuid ? updatedTile : tile,
                ),
            );
            setHaveTilesChanged(true);
        },
        [setDashboardTiles, setHaveTilesChanged],
    );

    const handleCancel = useCallback(() => {
        sessionStorage.clear();
        setDashboardTiles(dashboard?.tiles || []);
        setHaveTilesChanged(false);
        if (dashboard) setDashboardFilters(dashboard.filters);
        setHaveFiltersChanged(false);
        history.push(
            `/projects/${projectUuid}/dashboards/${dashboardUuid}/view`,
        );
    }, [
        dashboard,
        dashboardUuid,
        history,
        projectUuid,
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

    const handleExportDashboard = () => {
        if (!dashboard) return;
        exportDashboard(dashboard);
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
        const createChartInDashboardFlow = sessionStorage.getItem(
            'unsavedDashboardTiles',
        );
        history.block((prompt) => {
            if (
                isEditMode &&
                (haveTilesChanged || haveFiltersChanged) &&
                !prompt.pathname.includes(
                    `/projects/${projectUuid}/dashboards/${dashboardUuid}`,
                ) &&
                createChartInDashboardFlow
            ) {
                setBlockedNavigationLocation(prompt.pathname);
                setIsSaveWarningModalOpen(true);
                return false; // blocks history
            }
            return undefined; // allow history
        });

        return () => {
            history.block(() => {});
        };
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
            <div style={{ marginTop: '20px' }}>
                <NonIdealState title="Loading..." icon={<Spinner />} />
            </div>
        );
    }
    const dashboardChartTiles = dashboardTiles.filter(
        (tile) => tile.type === DashboardTileTypes.SAVED_CHART,
    );

    return (
        <>
            <Alert
                isOpen={isSaveWarningModalOpen}
                cancelButtonText="Stay"
                confirmButtonText="Leave"
                intent={Intent.DANGER}
                icon="warning-sign"
                onCancel={() => setIsSaveWarningModalOpen(false)}
                onConfirm={() => {
                    history.block(() => {});
                    if (blockedNavigationLocation)
                        history.push(blockedNavigationLocation);
                }}
            >
                <p>
                    You have unsaved changes to your dashboard! Are you sure you
                    want to leave without saving?{' '}
                </p>
            </Alert>

            <Page
                withFooter
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
                        isEditMode={isEditMode}
                        isSaving={isSaving}
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
                {dashboardChartTiles.length > 0 && (
                    <DashboardFilter isEditMode={isEditMode} />
                )}

                <ResponsiveGridLayout
                    {...RESPONSIVE_GRID_LAYOUT_PROPS}
                    onDragStop={handleUpdateTiles}
                    onResizeStop={handleUpdateTiles}
                    layouts={layouts}
                >
                    {dashboardTiles.map((tile) => {
                        return (
                            <div key={tile.uuid}>
                                <TrackSection name={SectionName.DASHBOARD_TILE}>
                                    <GridTile
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

                {dashboardTiles.length <= 0 && (
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
