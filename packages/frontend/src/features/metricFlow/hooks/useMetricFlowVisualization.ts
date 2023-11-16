import { ApiQueryResults, ChartConfig, ChartType } from '@lightdash/common';
import { useMemo, useState } from 'react';
import { getValidChartConfig } from '../../../providers/ExplorerProvider';

const useMetricFlowVisualization = (
    resultsData: ApiQueryResults | undefined,
) => {
    const [chartType, setChartType] = useState<ChartType>(ChartType.CARTESIAN);
    const [chartConfig, setChartConfig] = useState<ChartConfig['config']>();
    const [_pivotFields, setPivotFields] = useState<string[] | undefined>();

    const columnOrder = useMemo(() => {
        return resultsData
            ? [
                  ...resultsData.metricQuery.dimensions,
                  ...resultsData.metricQuery.metrics,
              ]
            : [];
    }, [resultsData]);

    const validChartConfig = useMemo(() => {
        return getValidChartConfig({ type: chartType, config: chartConfig });
    }, [chartType, chartConfig]);

    return {
        columnOrder,
        chartConfig: validChartConfig,
        setChartType,
        setChartConfig,
        setPivotFields,
    };
};
export default useMetricFlowVisualization;
