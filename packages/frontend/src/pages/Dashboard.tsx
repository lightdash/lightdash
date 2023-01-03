import { Alert, Intent, NonIdealState, Spinner } from '@blueprintjs/core';
import { Dashboard as IDashboard, DashboardTileTypes } from '@lightdash/common';
import React, {
    FC,
    memo,
    useCallback,
    useEffect,
    useMemo,
    useState,
} from 'react';
import { Layout, Responsive, WidthProvider } from 'react-grid-layout';
import { Helmet } from 'react-helmet';
import { useHistory, useParams } from 'react-router-dom';
import DashboardHeader from '../components/common/Dashboard/DashboardHeader';
import Error from '../components/common/Error';
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
    useDashboardQuery,
    useDeleteMutation,
    useDuplicateDashboardMutation,
    useMoveDashboard,
    useUpdateDashboard,
} from '../hooks/dashboard/useDashboard';
import { useSavedQuery } from '../hooks/useSavedQuery';
import { useSpaces } from '../hooks/useSpaces';
import { useDashboardContext } from '../providers/DashboardProvider';
import { TrackSection } from '../providers/TrackingProvider';
import '../styles/react-grid.css';
import { SectionName } from '../types/Events';

const ResponsiveGridLayout = WidthProvider(Responsive);

const GridTile: FC<
    Pick<
        React.ComponentProps<typeof TileBase>,
        'tile' | 'onEdit' | 'onDelete' | 'isEditMode'
    >
> = memo((props) => {
    const { tile } = props;

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
            if (isLoading) return <></>;
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
            const never: never = tile;
            throw new Error(
                `Dashboard tile type "${props.tile.type}" not recognised`,
            );
        }
    }
});

const Dashboard = () => {
    const history = useHistory();
    const { projectUuid, dashboardUuid, mode } = useParams<{
        projectUuid: string;
        dashboardUuid: string;
        mode?: string;
    }>();
    const { data: spaces } = useSpaces(projectUuid);

    const {
        dashboardFilters,
        dashboardTemporaryFilters,
        haveFiltersChanged,
        setHaveFiltersChanged,
        dashboardTiles,
        setDashboardTiles,
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
    const { data: dashboard, error: dashboardError } =
        useDashboardQuery(dashboardUuid);
    const [hasTilesChanged, setHasTilesChanged] = useState<boolean>(false);
    const [dashboardName, setDashboardName] = useState<string>('');
    const {
        mutate,
        isSuccess,
        reset,
        isLoading: isSaving,
    } = useUpdateDashboard(dashboardUuid);
    const { mutate: moveDashboardToSpace } = useMoveDashboard(dashboardUuid);
    const { mutate: duplicateDashboard } = useDuplicateDashboardMutation(
        dashboardUuid,
        true,
    );
    const { mutateAsync: deleteDashboard } = useDeleteMutation();

    const layouts = useMemo(
        () => ({
            lg: dashboardTiles.map<Layout>((tile) => ({
                minH: 2,
                minW: 6,
                x: tile.x,
                y: tile.y,
                w: tile.w,
                h: tile.h,
                i: tile.uuid,
                isDraggable: isEditMode,
                isResizable: isEditMode,
            })),
        }),
        [dashboardTiles, isEditMode],
    );

    useEffect(() => {
        if (dashboard?.tiles) {
            setDashboardTiles(dashboard.tiles);
        }
    }, [dashboard, setDashboardTiles]);

    useEffect(() => {
        if (isSuccess) {
            setHasTilesChanged(false);
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
    ]);

    const updateTiles = useCallback(
        (layout: Layout[]) => {
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
            setHasTilesChanged(true);
        },
        [setDashboardTiles],
    );
    const onAddTiles = useCallback(
        (tiles: IDashboard['tiles'][number][]) => {
            setHasTilesChanged(true);
            setDashboardTiles((currentDashboardTiles) => {
                return appendNewTilesToBottom(currentDashboardTiles, tiles);
            });
        },
        [setDashboardTiles],
    );
    const onDelete = useCallback(
        (tile: IDashboard['tiles'][number]) => {
            setDashboardTiles((currentDashboardTiles) =>
                currentDashboardTiles.filter(
                    (filteredTile) => filteredTile.uuid !== tile.uuid,
                ),
            );
            setHasTilesChanged(true);
        },
        [setDashboardTiles],
    );
    const onEdit = useCallback(
        (updatedTile: IDashboard['tiles'][number]) => {
            setDashboardTiles((currentDashboardTiles) =>
                currentDashboardTiles.map((tile) =>
                    tile.uuid === updatedTile.uuid ? updatedTile : tile,
                ),
            );
            setHasTilesChanged(true);
        },
        [setDashboardTiles],
    );
    const onCancel = useCallback(() => {
        setDashboardTiles(dashboard?.tiles || []);
        setHasTilesChanged(false);
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
    ]);

    const handleMoveDashboardToSpace = (spaceUuid: string) => {
        if (!dashboard) return;
        moveDashboardToSpace({ name: dashboard.name, spaceUuid });
    };

    const handleDuplicateDashboard = () => {
        if (!dashboard) return;
        duplicateDashboard(dashboard.uuid);
    };

    const handleDeleteDashboard = () => {
        if (!dashboard) return;
        deleteDashboard(dashboard.uuid).then(() => {
            history.replace(`/projects/${projectUuid}/dashboards`);
        });
    };

    const updateTitle = (name: string) => {
        setHasTilesChanged(true);
        setDashboardName(name);
    };

    const [isSaveWarningModalOpen, setIsSaveWarningModalOpen] =
        useState<boolean>(false);
    const [blockedNavigationLocation, setBlockedNavigationLocation] =
        useState<string>();

    useEffect(() => {
        const checkReload = (event: BeforeUnloadEvent) => {
            if (isEditMode && (hasTilesChanged || haveFiltersChanged)) {
                const message =
                    'You have unsaved changes to your dashboard! Are you sure you want to leave without saving?';
                event.returnValue = message;
                return message;
            }
        };
        window.addEventListener('beforeunload', checkReload);
        return () => window.removeEventListener('beforeunload', checkReload);
    }, [hasTilesChanged, haveFiltersChanged, isEditMode]);

    useEffect(() => {
        history.block((prompt) => {
            if (
                isEditMode &&
                (hasTilesChanged || haveFiltersChanged) &&
                !prompt.pathname.includes(
                    `/projects/${projectUuid}/dashboards/${dashboardUuid}`,
                )
            ) {
                setBlockedNavigationLocation(prompt.pathname);
                setIsSaveWarningModalOpen(true);
                return false; //blocks history
            }
            return undefined; // allow history
        });

        return () => {
            history.block(() => {});
        };
    }, [
        isEditMode,
        history,
        hasTilesChanged,
        haveFiltersChanged,
        projectUuid,
        dashboardUuid,
    ]);

    if (dashboardError) {
        return (
            <div style={{ marginTop: '20px' }}>
                <Error error={dashboardError.error} />
            </div>
        );
    }
    if (dashboard === undefined) {
        return <Spinner />;
    }
    const dashboardChartTiles = dashboardTiles.filter(
        (tile) => tile.type === DashboardTileTypes.SAVED_CHART,
    );

    return (
        <>
            <Helmet>
                <title>{dashboardName || dashboard.name} - Lightdash</title>
            </Helmet>
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

            <DashboardHeader
                spaces={spaces}
                dashboardName={dashboard.name}
                dashboardDescription={dashboard.description}
                dashboardUpdatedByUser={dashboard.updatedByUser}
                dashboardUpdatedAt={dashboard.updatedAt}
                dashboardSpaceName={dashboard.spaceName}
                dashboardSpaceUuid={dashboard.spaceUuid}
                isEditMode={isEditMode}
                isSaving={isSaving}
                hasDashboardChanged={
                    hasTilesChanged || haveFiltersChanged || hasTemporaryFilters
                }
                onAddTiles={onAddTiles}
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
                        name: dashboardName || dashboard.name,
                    })
                }
                onUpdate={(values) => values && updateTitle(values.name)}
                onCancel={onCancel}
                onMoveToSpace={handleMoveDashboardToSpace}
                onDuplicate={handleDuplicateDashboard}
                onDelete={handleDeleteDashboard}
            />
            <Page isContentFullWidth>
                {dashboardChartTiles.length > 0 && (
                    <DashboardFilter isEditMode={isEditMode} />
                )}
                <ResponsiveGridLayout
                    useCSSTransforms={false}
                    draggableCancel=".non-draggable"
                    onDragStop={updateTiles}
                    onResizeStop={updateTiles}
                    breakpoints={{ lg: 1200, md: 996, sm: 768 }}
                    cols={{ lg: 36, md: 30, sm: 18 }}
                    rowHeight={50}
                    layouts={layouts}
                >
                    {dashboardTiles.map((tile) => {
                        return (
                            <div key={tile.uuid}>
                                <TrackSection name={SectionName.DASHBOARD_TILE}>
                                    <GridTile
                                        isEditMode={isEditMode}
                                        tile={tile}
                                        onDelete={onDelete}
                                        onEdit={onEdit}
                                    />
                                </TrackSection>
                            </div>
                        );
                    })}
                </ResponsiveGridLayout>
                {dashboardTiles.length <= 0 && <EmptyStateNoTiles />}
            </Page>
        </>
    );
};
export default Dashboard;
