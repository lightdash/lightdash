import { Spinner } from '@blueprintjs/core';
import { DashboardChartTile, DashboardTileTypes } from 'common';
import React, { useEffect, useState } from 'react';
import { Layout, Responsive, WidthProvider } from 'react-grid-layout';
import { useParams } from 'react-router-dom';
import DashboardHeader from '../components/common/Dashboard/DashboardHeader';
import ChartTile from '../components/DashboardTiles/DashboardChartTile';
import EmptyStateNoTiles from '../components/DashboardTiles/EmptyStateNoTiles';
import {
    useDashboardQuery,
    useUpdateDashboard,
} from '../hooks/dashboard/useDashboard';
import '../styles/react-grid.css';

const ResponsiveGridLayout = WidthProvider(Responsive);

const Dashboard = () => {
    const { dashboardUuid } = useParams<{ dashboardUuid: string }>();
    const { data: dashboard } = useDashboardQuery(dashboardUuid);
    const [hasTilesChanged, setHasTilesChanged] = useState(false);
    const {
        mutate,
        isSuccess,
        reset,
        isLoading: isSaving,
    } = useUpdateDashboard(dashboardUuid);
    const [dashboardTiles, setTiles] = useState<DashboardChartTile[]>([]);
    const tileProperties = Object.fromEntries(
        dashboardTiles.map((tile) => [tile.uuid, tile.properties]) || [],
    );

    useEffect(() => {
        setTiles(dashboard?.tiles || []);
    }, [dashboard]);

    useEffect(() => {
        if (isSuccess) {
            setHasTilesChanged(false);
            reset();
        }
    }, [isSuccess, reset]);

    const updateTiles = (layout: Layout[]) => {
        const tiles: DashboardChartTile[] = layout.map((tile) => ({
            uuid: tile.i,
            x: tile.x,
            y: tile.y,
            h: tile.h,
            w: tile.w,
            type: DashboardTileTypes.SAVED_CHART,
            properties: tileProperties[tile.i],
        }));
        setTiles(tiles);
        setHasTilesChanged(true);
    };
    if (dashboard === undefined) {
        return <Spinner />;
    }
    const onAddTile = (tile: DashboardChartTile) => {
        setHasTilesChanged(true);
        setTiles([...dashboardTiles, tile]);
    };
    return (
        <>
            <DashboardHeader
                dashboardName={dashboard.name}
                isSaving={isSaving}
                hasTilesChanged={hasTilesChanged}
                onAddTile={(tile: DashboardChartTile) => onAddTile(tile)}
                onSaveDashboard={() => mutate({ tiles: dashboardTiles })}
            />
            <ResponsiveGridLayout
                draggableCancel=".non-draggable"
                onDragStop={(layout) => updateTiles(layout)}
                onResizeStop={(layout) => updateTiles(layout)}
                breakpoints={{ lg: 1200, md: 996, sm: 768 }}
                cols={{ lg: 12, md: 10, sm: 6 }}
                layouts={{
                    lg: dashboardTiles.map((tile) => ({
                        ...tile,
                        i: tile.uuid,
                    })),
                }}
            >
                {dashboardTiles.map((tile: DashboardChartTile) => (
                    <div key={tile.uuid}>
                        <ChartTile
                            tile={tile}
                            onDelete={() => {
                                setTiles(
                                    dashboardTiles.filter(
                                        (filteredTile) =>
                                            filteredTile.uuid !== tile.uuid,
                                    ),
                                );
                                setHasTilesChanged(true);
                            }}
                        />
                    </div>
                ))}
            </ResponsiveGridLayout>
            {dashboardTiles.length <= 0 && (
                <EmptyStateNoTiles
                    onAddTile={(tile: DashboardChartTile) => onAddTile(tile)}
                />
            )}
        </>
    );
};
export default Dashboard;
