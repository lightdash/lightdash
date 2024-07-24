import { useDashboardContext } from '../../providers/DashboardProvider';
import { useChartAndResults } from '../useQueryResults';
import useDashboardFiltersForTile from './useDashboardFiltersForTile';

const useDashboardChart = (tileUuid: string, savedChartUuid: string | null) => {
    const dashboardUuid = useDashboardContext((c) => c.dashboard?.uuid);
    const invalidateCache = useDashboardContext((c) => c.invalidateCache);
    const dashboardFilters = useDashboardFiltersForTile(tileUuid);
    const chartSort = useDashboardContext((c) => c.chartSort);
    const tileSort = chartSort[tileUuid] || [];
    const granularity = useDashboardContext((c) => c.dateZoomGranularity);
    const isAutoRefresh = useDashboardContext((c) => c.isAutoRefresh);
    return useChartAndResults(
        savedChartUuid,
        dashboardUuid ?? null,
        dashboardFilters,
        tileSort,
        invalidateCache,
        granularity,
        isAutoRefresh,
    );
};

export default useDashboardChart;
