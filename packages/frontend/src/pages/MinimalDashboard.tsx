import {
    assertUnreachable,
    DashboardFilters,
    DashboardTileTypes,
} from '@lightdash/common';
import { FC, useMemo } from 'react';
import { Layout, Responsive, WidthProvider } from 'react-grid-layout';
import { useLocation, useParams } from 'react-router-dom';
import ChartTile from '../components/DashboardTiles/DashboardChartTile';
import LoomTile from '../components/DashboardTiles/DashboardLoomTile';
import MarkdownTile from '../components/DashboardTiles/DashboardMarkdownTile';
import { useDashboardQuery } from '../hooks/dashboard/useDashboard';
import {
    DashboardProvider,
    useDashboardContext,
} from '../providers/DashboardProvider';

import { useMount } from 'react-use';
import '../styles/react-grid.css';
import {
    getReactGridLayoutConfig,
    RESPONSIVE_GRID_LAYOUT_PROPS,
} from './Dashboard';

const ResponsiveGridLayout = WidthProvider(Responsive);

const MinimalDashboard: FC = () => {
    const { dashboardUuid } = useParams<{ dashboardUuid: string }>();
    const {
        data: dashboard,
        isError,
        error,
    } = useDashboardQuery(dashboardUuid);

    const dashboardFilters: DashboardFilters | undefined = useMemo(() => {
        const searchParams = new URLSearchParams(window.location.search);
        const filterSearchParam = searchParams.get('filters');
        return filterSearchParam ? JSON.parse(filterSearchParam) : undefined;
    }, []);

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
        lg: dashboard.tiles.map<Layout>((tile) =>
            getReactGridLayoutConfig(tile),
        ),
    };

    return (
        <DashboardProvider>
            <ResponsiveGridLayout
                {...RESPONSIVE_GRID_LAYOUT_PROPS}
                layouts={layouts}
            >
                {dashboard.tiles.map((tile) => (
                    <div key={tile.uuid}>
                        {tile.type === DashboardTileTypes.SAVED_CHART ? (
                            <ChartTile
                                key={tile.uuid}
                                dashboardFilters={dashboardFilters}
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
