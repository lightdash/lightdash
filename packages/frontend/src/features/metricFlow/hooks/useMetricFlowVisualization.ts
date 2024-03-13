import {
    ChartType,
    type ApiQueryResults,
    type ChartConfig,
} from '@lightdash/common';
import { useCallback, useMemo, useState } from 'react';
import { getValidChartConfig } from '../../../providers/ExplorerProvider';

const useMetricFlowVisualization = (
    resultsData: ApiQueryResults | undefined,
) => {
    const [chartConfig, setChartConfig] = useState<ChartConfig>(
        getValidChartConfig(ChartType.CARTESIAN, undefined),
    );
    const [_pivotFields, setPivotFields] = useState<string[] | undefined>();

    const columnOrder = useMemo(() => {
        return resultsData
            ? [
                  ...resultsData.metricQuery.dimensions,
                  ...resultsData.metricQuery.metrics,
              ]
            : [];
    }, [resultsData]);

    const handleChartTypeChange = useCallback(
        (chartType: ChartType) => {
            setChartConfig(getValidChartConfig(chartType, chartConfig));
        },
        [chartConfig],
    );

    return {
        columnOrder,
        chartConfig,
        setChartType: handleChartTypeChange,
        setChartConfig,
        setPivotFields,
    };
};
export default useMetricFlowVisualization;
