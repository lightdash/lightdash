import { Spinner } from '@blueprintjs/core';
import {
    Dashboard as IDashboard,
    DashboardTileTypes,
    FilterRule,
} from 'common';
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
import Page from '../components/common/Page/Page';
import ChartTile from '../components/DashboardTiles/DashboardChartTile';
import LoomTile from '../components/DashboardTiles/DashboardLoomTile';
import MarkdownTile from '../components/DashboardTiles/DashboardMarkdownTile';
import EmptyStateNoTiles from '../components/DashboardTiles/EmptyStateNoTiles';
import TileBase from '../components/DashboardTiles/TileBase';
import {
    useDashboardQuery,
    useUpdateDashboard,
} from '../hooks/dashboard/useDashboard';
import '../styles/react-grid.css';

const ResponsiveGridLayout = WidthProvider(Responsive);

const GridTile: FC<
    Pick<
        React.ComponentProps<typeof TileBase>,
        'tile' | 'onEdit' | 'onDelete' | 'isEditMode'
    >
> = memo((props) => {
    const { tile } = props;
    switch (tile.type) {
        case DashboardTileTypes.SAVED_CHART:
            return <ChartTile {...props} tile={tile} />;
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
    const isEditMode = useMemo(() => mode === 'edit', [mode]);
    const { data: dashboard } = useDashboardQuery(dashboardUuid);
    const [hasTilesChanged, setHasTilesChanged] = useState(false);
    const {
        mutate,
        isSuccess,
        reset,
        isLoading: isSaving,
    } = useUpdateDashboard(dashboardUuid);
    const [dashboardFilters, setDashboardFilters] = useState<FilterRule[]>([]);
    const [dashboardTiles, setTiles] = useState<IDashboard['tiles']>([]);
    const layouts = useMemo(
        () => ({
            lg: dashboardTiles.map<Layout>((tile) => ({
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
            setTiles(dashboard.tiles);
        }
    }, [dashboard]);

    useEffect(() => {
        if (isSuccess) {
            setHasTilesChanged(false);
            reset();
            history.push(
                `/projects/${projectUuid}/dashboards/${dashboardUuid}/view`,
            );
        }
    }, [dashboardUuid, history, isSuccess, projectUuid, reset]);

    const updateTiles = useCallback((layout: Layout[]) => {
        setTiles((currentDashboardTiles) =>
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
    }, []);
    const onAddTile = useCallback((tile: IDashboard['tiles'][number]) => {
        setHasTilesChanged(true);
        setTiles((currentDashboardTiles) => [...currentDashboardTiles, tile]);
    }, []);
    const onDelete = useCallback((tile: IDashboard['tiles'][number]) => {
        setTiles((currentDashboardTiles) =>
            currentDashboardTiles.filter(
                (filteredTile) => filteredTile.uuid !== tile.uuid,
            ),
        );
        setHasTilesChanged(true);
    }, []);
    const onEdit = useCallback((updatedTile: IDashboard['tiles'][number]) => {
        setTiles((currentDashboardTiles) =>
            currentDashboardTiles.map((tile) =>
                tile.uuid === updatedTile.uuid ? updatedTile : tile,
            ),
        );
        setHasTilesChanged(true);
    }, []);
    const onCancel = useCallback(() => {
        setTiles(dashboard?.tiles || []);
        setHasTilesChanged(false);
        history.push(
            `/projects/${projectUuid}/dashboards/${dashboardUuid}/view`,
        );
    }, [dashboard, dashboardUuid, history, projectUuid]);

    if (dashboard === undefined) {
        return <Spinner />;
    }
    return (
        <>
            <DashboardHeader
                dashboardName={dashboard.name}
                isEditMode={isEditMode}
                isSaving={isSaving}
                hasTilesChanged={hasTilesChanged}
                onAddTile={onAddTile}
                onSaveDashboard={() => mutate({ tiles: dashboardTiles })}
                onSaveTitle={(name) => mutate({ name })}
                onCancel={onCancel}
            />
            <Page isContentFullWidth>
                <ResponsiveGridLayout
                    useCSSTransforms={false}
                    draggableCancel=".non-draggable"
                    onDragStop={updateTiles}
                    onResizeStop={updateTiles}
                    breakpoints={{ lg: 1200, md: 996, sm: 768 }}
                    cols={{ lg: 12, md: 10, sm: 6 }}
                    layouts={layouts}
                >
                    {dashboardTiles.map((tile) => (
                        <div key={tile.uuid}>
                            <GridTile
                                isEditMode={isEditMode}
                                tile={tile}
                                onDelete={onDelete}
                                onEdit={onEdit}
                            />
                        </div>
                    ))}
                </ResponsiveGridLayout>
                {dashboardTiles.length <= 0 && isEditMode && (
                    <EmptyStateNoTiles onAddTile={onAddTile} />
                )}
            </Page>
        </>
    );
};
export default Dashboard;
