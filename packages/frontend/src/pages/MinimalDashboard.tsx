import { assertUnreachable, DashboardTileTypes } from '@lightdash/common';
import { FC } from 'react';
import { Layout, Responsive, WidthProvider } from 'react-grid-layout';
import { useParams } from 'react-router-dom';
import ChartTile from '../components/DashboardTiles/DashboardChartTile';
import LoomTile from '../components/DashboardTiles/DashboardLoomTile';
import MarkdownTile from '../components/DashboardTiles/DashboardMarkdownTile';
import { useDashboardQuery } from '../hooks/dashboard/useDashboard';
import { DashboardProvider } from '../providers/DashboardProvider';

import '../styles/react-grid.css';

const ResponsiveGridLayout = WidthProvider(Responsive);

const MinimalDashboard: FC = () => {
    const { dashboardUuid } = useParams<{ dashboardUuid: string }>();
    const {
        data: dashboard,
        isError,
        error,
    } = useDashboardQuery(dashboardUuid);

    if (isError) {
        return <>{error.error.message}</>;
    }

    if (!dashboard) {
        return <>Loading...</>;
    }

    if (dashboard.tiles.length === 0) {
        return <>No tiles</>;
    }

    const layouts = {
        lg: dashboard.tiles.map<Layout>((tile) => ({
            minH: 2,
            minW: 6,
            x: tile.x,
            y: tile.y,
            w: tile.w,
            h: tile.h,
            i: tile.uuid,
            isDraggable: false,
            isResizable: false,
        })),
    };

    return (
        <DashboardProvider>
            <ResponsiveGridLayout
                useCSSTransforms={false}
                breakpoints={{ lg: 1200, md: 996, sm: 768 }}
                cols={{ lg: 36, md: 30, sm: 18 }}
                rowHeight={50}
                layouts={layouts}
            >
                {dashboard.tiles.map((tile) => (
                    <div key={tile.uuid}>
                        {tile.type === DashboardTileTypes.SAVED_CHART ? (
                            <ChartTile
                                key={tile.uuid}
                                minimal
                                tile={tile}
                                isEditMode={false}
                                onDelete={() => {}}
                                onEdit={() => {}}
                            />
                        ) : tile.type === DashboardTileTypes.MARKDOWN ? (
                            <MarkdownTile
                                key={tile.uuid}
                                tile={tile}
                                isEditMode={false}
                                onDelete={() => {}}
                                onEdit={() => {}}
                            />
                        ) : tile.type === DashboardTileTypes.LOOM ? (
                            <LoomTile
                                key={tile.uuid}
                                tile={tile}
                                isEditMode={false}
                                onDelete={() => {}}
                                onEdit={() => {}}
                            />
                        ) : (
                            assertUnreachable(
                                tile,
                                `Dashboard tile type is not recognised`,
                            )
                        )}
                    </div>
                ))}
            </ResponsiveGridLayout>
        </DashboardProvider>
    );
};

export default MinimalDashboard;
