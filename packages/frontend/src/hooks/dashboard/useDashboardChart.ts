import { useDashboardContext } from '../../providers/DashboardProvider';
import { useChartResults } from '../useQueryResults';
import useDashboardFiltersForTile from './useDashboardFiltersForTile';

const useDashboardChart = (tileUuid: string, savedChartUuid: string | null) => {
    const invalidateCache = useDashboardContext((c) => c.invalidateCache);
    const dashboardFilters = useDashboardFiltersForTile(tileUuid);
    const chartSort = useDashboardContext((c) => c.chartSort);
    const tileSort = chartSort[tileUuid] || [];
    return useChartResults(
        savedChartUuid,
        dashboardFilters,
        tileSort,
        invalidateCache,
    );
};

export default useDashboardChart;
