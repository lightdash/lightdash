import {
    ChartType,
    type ApiQueryResults,
    type ChartConfig,
} from '@lightdash/common';
import { useCallback, useMemo, useState } from 'react';
import { getValidChartConfig } from '../../../providers/Explorer/utils';

const useMetricFlowVisualization = (
    resultsData: ApiQueryResults | undefined,
) => {
    const [chartConfig, setChartConfig] = useState<ChartConfig>(
        getValidChartConfig(ChartType.CARTESIAN),
    );
    const [pivotFields, setPivotFields] = useState<string[] | undefined>();

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
            setChartConfig(
                getValidChartConfig(chartType, undefined, chartConfig),
            );
        },
        [chartConfig],
    );

    return {
        columnOrder,
        chartConfig,
        pivotFields,
        setChartType: handleChartTypeChange,
        setChartConfig,
        setPivotFields,
    };
};
export default useMetricFlowVisualization;
