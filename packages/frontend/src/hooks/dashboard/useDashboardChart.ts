import { useDashboardContext } from '../../providers/DashboardProvider';
import { useChartResults } from '../useQueryResults';
import useDashboardFiltersForTile from './useDashboardFiltersForTile';

const useDashboardChart = (tileUuid: string, savedChartUuid: string | null) => {
    const invalidateCache = useDashboardContext((c) => c.invalidateCache);
    const dashboardFilters = useDashboardFiltersForTile(tileUuid);
    return useChartResults(savedChartUuid, dashboardFilters, invalidateCache);
};

export default useDashboardChart;
