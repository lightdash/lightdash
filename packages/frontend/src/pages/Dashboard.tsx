import React from 'react';
import { Responsive, WidthProvider, Layout } from 'react-grid-layout';
import '../styles/react-grid.css';
import { useParams } from 'react-router-dom';
import { DashboardChartTile, DashboardTileTypes } from 'common';
import {
    useDashboardQuery,
    useUpdateDashboard,
} from '../hooks/dashboard/useDashboard';
import ChartTile from '../components/DashboardTiles/DashboardChartTile';
import AddTileButton from '../components/DashboardTiles/AddTile/AddTileButton';

const ResponsiveGridLayout = WidthProvider(Responsive);
const Dashboard = () => {
    const { dashboardUuid } = useParams<{ dashboardUuid: string }>();
    const { data: dashboard } = useDashboardQuery(dashboardUuid);
    const { mutate } = useUpdateDashboard(dashboardUuid);

    const updateTiles = (layout: Layout[]) => {
        const tiles = layout.map((tile) => ({
            x: tile.x,
            y: tile.y,
            h: tile.h,
            w: tile.w,
            type: DashboardTileTypes.SAVED_CHART,
            properties: {
                savedChartUuid: tile.i,
            },
        }));
        mutate({ tiles });
    };

    return (
        <>
            {dashboard && <AddTileButton dashboard={dashboard} />}
            <ResponsiveGridLayout
                onDragStop={(layout) => updateTiles(layout)}
                onResizeStop={(layout) => updateTiles(layout)}
                breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
                cols={{ lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 }}
            >
                {dashboard &&
                    dashboard.tiles &&
                    dashboard.tiles.map((tile: DashboardChartTile) => {
                        const {
                            x,
                            y,
                            h,
                            w,
                            properties: { savedChartUuid },
                        } = tile;
                        return (
                            <div
                                key={savedChartUuid}
                                data-grid={{ x, y, w, h }}
                            >
                                <ChartTile
                                    tile={tile}
                                    onDelete={() =>
                                        mutate({
                                            tiles: dashboard.tiles.filter(
                                                (filteredTile) =>
                                                    savedChartUuid !==
                                                    filteredTile.properties
                                                        .savedChartUuid,
                                            ),
                                        })
                                    }
                                />
                            </div>
                        );
                    })}
            </ResponsiveGridLayout>
        </>
    );
};
export default Dashboard;
