import { ApiQueryResults, ChartConfig, ChartType } from '@lightdash/common';
import { useState } from 'react';
import { getValidChartConfig } from '../../../providers/ExplorerProvider';

const useMetricFlowVisualization = (
    resultsData: ApiQueryResults | undefined,
) => {
    const [chartType, setChartType] = useState<ChartType>(ChartType.CARTESIAN);
    const [chartConfig, setChartConfig] = useState<ChartConfig['config']>();
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
        chartConfig: getValidChartConfig(chartType, chartConfig),
        setChartType,
        setChartConfig,
        setPivotFields,
    };
};
export default useMetricFlowVisualization;
