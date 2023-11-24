import { useDashboardContext } from '../../providers/DashboardProvider';
import { useChartResults } from '../useQueryResults';
import useDashboardFiltersForTile from './useDashboardFiltersForTile';

const useDashboardChart = (tileUuid: string, savedChartUuid: string | null) => {
    const invalidateCache = useDashboardContext((c) => c.invalidateCache);
    const dashboardFilters = useDashboardFiltersForTile(tileUuid);
    const chartSort = useDashboardContext((c) => c.chartSort);
    const tileSort = chartSort[tileUuid] || [];
    //TODO replace with dashboard context
    const granularity = localStorage.getItem('granularity') || undefined;
    return useChartResults(
        savedChartUuid,
        dashboardFilters,
        tileSort,
        invalidateCache,
        granularity,
    );
};

export default useDashboardChart;
