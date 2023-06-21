import { /* ApiQueryResults, Explore, */ PieChart } from '@lightdash/common';
import { useMemo, useState } from 'react';

const usePieChartConfig = (
    pieChartConfig: PieChart | undefined,
    // resultsData: ApiQueryResults | undefined,
    // explore: Explore | undefined,
) => {
    const [isDonut /*, setIsDonut */] = useState<boolean>(
        pieChartConfig?.isDonut ?? false,
    );
    const validPieChartConfig: PieChart = useMemo(() => {
        return {
            isDonut,
        };
    }, [isDonut]);

    return {
        validPieChartConfig,
    };
};

export default usePieChartConfig;
