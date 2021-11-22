import { Spinner } from '@blueprintjs/core';
import { Dashboard as IDashboard, DashboardTileTypes } from 'common';
import React, { FC, useEffect, useMemo, useState } from 'react';
import { Layout, Responsive, WidthProvider } from 'react-grid-layout';
import { useHistory, useParams } from 'react-router-dom';
import DashboardHeader from '../components/common/Dashboard/DashboardHeader';
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
> = (props) => {
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
};

const Dashboard = () => {
    const history = useHistory();
    const { projectUuid, dashboardUuid, mode } = useParams<{
        projectUuid: string;
        dashboardUuid: string;
        mode?: string;
    }>();
    const isEditMode = useMemo(() => mode === 'edit', [mode]);
    console.log('isEditMode', isEditMode, mode);
    const { data: dashboard } = useDashboardQuery(dashboardUuid);
    const [hasTilesChanged, setHasTilesChanged] = useState(false);
    const {
        mutate,
        isSuccess,
        reset,
        isLoading: isSaving,
    } = useUpdateDashboard(dashboardUuid);
    const [dashboardTiles, setTiles] = useState<IDashboard['tiles']>([]);
    const tileProperties = Object.fromEntries(
        dashboardTiles.map((tile) => [tile.uuid, tile]) || [],
    );
    const layouts = useMemo(
        () => ({
            lg: dashboardTiles.map<Layout>((tile) => ({
                ...tile,
                i: tile.uuid,
                isDraggable: isEditMode,
                isResizable: isEditMode,
            })),
        }),
        [dashboardTiles, isEditMode],
    );

    useEffect(() => {
        setTiles(dashboard?.tiles || []);
    }, [dashboard]);

    useEffect(() => {
        if (isSuccess) {
            setHasTilesChanged(false);
            reset();
            history.push(
                `/projects/${projectUuid}/dashboards/${dashboardUuid}/view`,
            );
        }
    }, [dashboardUuid, history, isEditMode, isSuccess, projectUuid, reset]);

    const updateTiles = (layout: Layout[]) => {
        const tiles = layout.map((tile) => ({
            ...tileProperties[tile.i],
            uuid: tile.i,
            x: tile.x,
            y: tile.y,
            h: tile.h,
            w: tile.w,
        }));
        setTiles(tiles);
        setHasTilesChanged(true);
    };
    if (dashboard === undefined) {
        return <Spinner />;
    }
    const onAddTile = (tile: IDashboard['tiles'][number]) => {
        setHasTilesChanged(true);
        setTiles([...dashboardTiles, tile]);
    };
    const onDelete = (tile: IDashboard['tiles'][number]) => {
        setTiles(
            dashboardTiles.filter(
                (filteredTile) => filteredTile.uuid !== tile.uuid,
            ),
        );
        setHasTilesChanged(true);
    };
    const onEdit = (updatedTile: IDashboard['tiles'][number]) => {
        setTiles(
            dashboardTiles.map((tile) =>
                tile.uuid === updatedTile.uuid ? updatedTile : tile,
            ),
        );
        setHasTilesChanged(true);
    };

    const onCancel = () => {
        setTiles(dashboard?.tiles);
        setHasTilesChanged(false);
        history.push(
            `/projects/${projectUuid}/dashboards/${dashboardUuid}/view`,
        );
    };

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
            <ResponsiveGridLayout
                isDraggable={isEditMode}
                isResizable={isEditMode}
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
        </>
    );
};
export default Dashboard;
