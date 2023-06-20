import { /* ApiQueryResults, Explore, */ PieChart } from '@lightdash/common';
import { useMemo } from 'react';

const usePieChartConfig = (
    pieChartConfig: PieChart | undefined,
    // resultsData: ApiQueryResults | undefined,
    // explore: Explore | undefined,
) => {
    const validPieChartConfig: PieChart = useMemo(() => {
        return {
            donut: pieChartConfig?.donut,
        };
    }, [pieChartConfig]);

    return {
        validPieChartConfig,
    };
};

export default usePieChartConfig;
