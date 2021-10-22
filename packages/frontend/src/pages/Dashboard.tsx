import React, { useEffect, useState } from 'react';
import { Layout, Responsive, WidthProvider } from 'react-grid-layout';
import '../styles/react-grid.css';
import { useParams } from 'react-router-dom';
import { DashboardChartTile, DashboardTileTypes } from 'common';
import styled from 'styled-components';
import { Button, Intent, Spinner } from '@blueprintjs/core';
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
    align-items: center;
`;

const Dashboard = () => {
    const { dashboardUuid } = useParams<{ dashboardUuid: string }>();
    const { data: dashboard } = useDashboardQuery(dashboardUuid);
    const { mutate } = useUpdateDashboard(dashboardUuid);
    const [dashboardTiles, setTiles] = useState<DashboardChartTile[]>([]);

    useEffect(() => {
        setTiles(dashboard?.tiles || []);
    }, [dashboard]);

    const tileProperties = Object.fromEntries(
        dashboardTiles.map((tile) => [tile.id, tile.properties]) || [],
    );
    const updateTiles = (layout: Layout[]) => {
        const tiles: DashboardChartTile[] = layout.map((tile) => ({
            id: tile.i,
            x: tile.x,
            y: tile.y,
            h: tile.h,
            w: tile.w,
            type: DashboardTileTypes.SAVED_CHART,
            properties: tileProperties[tile.i],
        }));
        setTiles(tiles);
    };
    if (dashboard === undefined) {
        return <Spinner />;
    }

    return (
        <>
            <WrapperAddTileButton>
                <AddTileButton dashboard={dashboard} />
                <Button
                    style={{ height: '20px' }}
                    text="Save"
                    intent={Intent.PRIMARY}
                    onClick={() => mutate({ tiles: dashboardTiles })}
                />
            </WrapperAddTileButton>
            <ResponsiveGridLayout
                draggableCancel=".non-draggable"
                onDragStop={(layout) => updateTiles(layout)}
                onResizeStop={(layout) => updateTiles(layout)}
                breakpoints={{ lg: 1200, md: 996, sm: 768 }}
                cols={{ lg: 12, md: 10, sm: 6 }}
                layouts={{
                    lg: dashboardTiles.map((tile) => ({
                        ...tile,
                        i: tile.id,
                    })),
                }}
            >
                {dashboardTiles.map((tile: DashboardChartTile) => (
                    // eslint-disable-next-line react/no-array-index-key
                    <div key={tile.id}>
                        <ChartTile
                            tile={tile}
                            onDelete={() =>
                                setTiles(
                                    dashboardTiles.filter(
                                        (filteredTile) =>
                                            filteredTile.id !== tile.id,
                                    ),
                                )
                            }
                        />
                    </div>
                ))}
            </ResponsiveGridLayout>
        </>
    );
};
export default Dashboard;
