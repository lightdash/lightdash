import { ApiQueryResults, ChartConfig, ChartType } from '@lightdash/common';
import { useState } from 'react';

const useSqlQueryVisualizationState = (
    resultsData: ApiQueryResults | undefined,
) => {
    const [chartType, setChartType] = useState<ChartType>(ChartType.CARTESIAN);
    const [_chartConfig, setChartConfig] = useState<ChartConfig['config']>();
    const [_pivotFields, setPivotFields] = useState<string[] | undefined>();

    const columnOrder = resultsData
        ? [
              ...resultsData.metricQuery.dimensions,
              ...resultsData.metricQuery.metrics,
          ]
        : [];

    return {
        chartType,
        columnOrder,
        setChartType,
        setChartConfig,
        setPivotFields,
    };
};
export default useSqlQueryVisualizationState;
