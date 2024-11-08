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
import SemanticViewerChartTile from '../components/DashboardTiles/DashboardSemanticViewerChartTile';
import SqlChartTile from '../components/DashboardTiles/DashboardSqlChartTile';
import { useScheduler } from '../features/scheduler/hooks/useScheduler';
import { useDashboardQuery } from '../hooks/dashboard/useDashboard';
import { useDateZoomGranularitySearch } from '../hooks/useExplorerRoute';
import useSearchParams from '../hooks/useSearchParams';
import { DashboardProvider } from '../providers/DashboardProvider';
import '../styles/react-grid.css';
import {
    getReactGridLayoutConfig,
    getResponsiveGridLayoutProps,
} from './Dashboard';

const ResponsiveGridLayout = WidthProvider(Responsive);

const MinimalDashboard: FC = () => {
    const { dashboardUuid } = useParams<{ dashboardUuid: string }>();
    const schedulerUuid = useSearchParams('schedulerUuid');
    const sendNowSchedulerFilters = useSearchParams('sendNowSchedulerFilters');
    const schedulerTabs = useSearchParams('selectedTabs');
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
        enabled: !!schedulerUuid && !sendNowSchedulerFilters,
    });

    const schedulerFilters = useMemo(() => {
        if (schedulerUuid && scheduler && isDashboardScheduler(scheduler)) {
            return scheduler.filters;
        }
        if (sendNowSchedulerFilters) {
            return JSON.parse(sendNowSchedulerFilters);
        }
        return undefined;
    }, [scheduler, schedulerUuid, sendNowSchedulerFilters]);

    const selectedTabs = useMemo(() => {
        if (schedulerTabs) {
            return JSON.parse(schedulerTabs);
        }
        return undefined;
    }, [schedulerTabs]);

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
                {dashboard.tiles.map((tile) =>
                    selectedTabs &&
                    !selectedTabs.includes(tile.tabUuid) ? null : (
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
                            ) : tile.type ===
                              DashboardTileTypes.SEMANTIC_VIEWER_CHART ? (
                                <SemanticViewerChartTile
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
                    ),
                )}
            </ResponsiveGridLayout>
        </DashboardProvider>
    );
};

export default MinimalDashboard;
