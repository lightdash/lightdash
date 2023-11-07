import { useDashboardContext } from '../../providers/DashboardProvider';
import { useChartResults } from '../useQueryResults';

const useDashboardChart = (savedChartUuid: string | null) => {
    const { invalidateCache } = useDashboardContext();
    return useChartResults(
        savedChartUuid,
        undefined, // TODO jose
        invalidateCache,
    );
};

export default useDashboardChart;
