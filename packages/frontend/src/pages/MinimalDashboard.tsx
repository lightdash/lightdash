import {
    assertUnreachable,
    DashboardTileTypes,
    isDashboardScheduler,
} from '@lightdash/common';
import { useMemo, type FC } from 'react';
import { Responsive, WidthProvider, type Layout } from 'react-grid-layout';
import { useParams } from 'react-router-dom';
import ChartTile from '../components/DashboardTiles/DashboardChartTile';
import LoomTile from '../components/DashboardTiles/DashboardLoomTile';
import MarkdownTile from '../components/DashboardTiles/DashboardMarkdownTile';
import { useScheduler } from '../features/scheduler/hooks/useScheduler';
import { useDashboardQuery } from '../hooks/dashboard/useDashboard';
import useSearchParams from '../hooks/useSearchParams';
import { DashboardProvider } from '../providers/DashboardProvider';
import {
    getReactGridLayoutConfig,
    getResponsiveGridLayoutProps,
} from './Dashboard';

import { DashboardSqlChartTile as SqlChartTile } from '../components/DashboardTiles/DashboardSqlChartTile';
import { useDateZoomGranularitySearch } from '../hooks/useExplorerRoute';
import '../styles/react-grid.css';

const ResponsiveGridLayout = WidthProvider(Responsive);

const MinimalDashboard: FC = () => {
    const { dashboardUuid } = useParams<{ dashboardUuid: string }>();
    const schedulerUuid = useSearchParams('schedulerUuid');
    const sendNowchedulerFilters = useSearchParams('sendNowchedulerFilters');
    const dateZoom = useDateZoomGranularitySearch();

    const {
        data: dashboard,
        isError: isDashboardError,
        error: dashboardError,
    } = useDashboardQuery(dashboardUuid);

    const {
        data: scheduler,
        isError: isSchedulerError,
        error: schedulerError,
    } = useScheduler(schedulerUuid!, {
        enabled: !!schedulerUuid && !sendNowchedulerFilters,
    });

    const schedulerFilters = useMemo(() => {
        if (schedulerUuid && scheduler && isDashboardScheduler(scheduler)) {
            return scheduler.filters;
        }
        if (sendNowchedulerFilters) {
            return JSON.parse(sendNowchedulerFilters);
        }
        return undefined;
    }, [scheduler, schedulerUuid, sendNowchedulerFilters]);

    if (isDashboardError || isSchedulerError) {
        if (dashboardError) return <>{dashboardError.error.message}</>;
        if (schedulerError) return <>{schedulerError.error.message}</>;
    }

    if (!dashboard) {
        return <>Loading...</>;
    }

    if (schedulerUuid && !scheduler) {
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
        <DashboardProvider
            schedulerFilters={schedulerFilters}
            dateZoom={dateZoom}
        >
            <ResponsiveGridLayout
                {...getResponsiveGridLayoutProps({
                    stackVerticallyOnSmallestBreakpoint: true,
                })}
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
                        ) : tile.type === DashboardTileTypes.SQL_CHART ? (
                            <SqlChartTile
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
