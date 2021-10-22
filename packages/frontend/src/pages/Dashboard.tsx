import React from 'react';
import { Layout, Responsive, WidthProvider } from 'react-grid-layout';
import '../styles/react-grid.css';
import { useParams } from 'react-router-dom';
import { DashboardChartTile, DashboardTileTypes } from 'common';
import styled from 'styled-components';
import { Spinner } from '@blueprintjs/core';
import {
    useDashboardQuery,
    useUpdateDashboard,
} from '../hooks/dashboard/useDashboard';
import ChartTile from '../components/DashboardTiles/DashboardChartTile';
import AddTileButton from '../components/DashboardTiles/AddTile/AddTileButton';

const ResponsiveGridLayout = WidthProvider(Responsive);

const WrapperAddTileButton = styled.div`
    display: flex;
    width: 100%;
    justify-content: center;
`;

const Dashboard = () => {
    const { dashboardUuid } = useParams<{ dashboardUuid: string }>();
    const { data: dashboard } = useDashboardQuery(dashboardUuid);
    const { mutate } = useUpdateDashboard(dashboardUuid);
    const tileProperties = Object.fromEntries(
        dashboard?.tiles?.map((tile) => [tile.uuid, tile.properties]) || [],
    );
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
        mutate({ tiles });
    };
    if (dashboard === undefined) {
        return <Spinner />;
    }

    return (
        <>
            <WrapperAddTileButton>
                <AddTileButton dashboard={dashboard} />
            </WrapperAddTileButton>
            <ResponsiveGridLayout
                draggableCancel=".non-draggable"
                onDragStop={(layout) => updateTiles(layout)}
                onResizeStop={(layout) => updateTiles(layout)}
                breakpoints={{ lg: 1200, md: 996, sm: 768 }}
                cols={{ lg: 12, md: 10, sm: 6 }}
                layouts={{
                    lg: dashboard.tiles.map((tile) => ({
                        ...tile,
                        i: tile.uuid,
                    })),
                }}
            >
                {dashboard.tiles.map((tile: DashboardChartTile) => (
                    <div key={tile.uuid}>
                        <ChartTile
                            tile={tile}
                            onDelete={() =>
                                mutate({
                                    tiles: dashboard.tiles.filter(
                                        (filteredTile) =>
                                            filteredTile.uuid !== tile.uuid,
                                    ),
                                })
                            }
                        />
                    </div>
                ))}
            </ResponsiveGridLayout>
        </>
    );
};
export default Dashboard;
