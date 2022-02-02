import { DBChartTypes, SavedQuery } from 'common';
import EChartsReact from 'echarts-for-react';
import React, { FC, RefObject } from 'react';
import { useChartConfig } from '../../hooks/useChartConfig';
import { useQueryResults } from '../../hooks/useQueryResults';
import { LoadingState } from '../ResultsTable/States';
import SimpleChart from '../SimpleChart';
import SimpleStatistic from '../SimpleStatistic';
import SimpleTable from '../SimpleTable';

interface Props {
    chartRef: RefObject<EChartsReact>;
    chartType: DBChartTypes;
    savedData: SavedQuery | undefined;
    tableName: string | undefined;
}

const LightdashVisualization: FC<Props> = ({
    savedData,
    chartRef,
    chartType,
    tableName,
}) => {
    const { data, isLoading } = useQueryResults();
    const chartConfig = useChartConfig(
        tableName,
        data,
        savedData?.chartConfig.seriesLayout,
    );

    if (isLoading || !chartConfig) {
        return <LoadingState />;
    }
    return (
        <>
            {chartType === DBChartTypes.BIG_NUMBER && (
                <SimpleStatistic
                    data={data}
                    label={
                        chartConfig.metricOptions[0] &&
                        chartConfig.metricOptions[0].label
                    }
                />
            )}
            {chartType === DBChartTypes.TABLE ? (
                <SimpleTable data={chartConfig.plotData} />
            ) : (
                <SimpleChart
                    isLoading={isLoading}
                    chartRef={chartRef}
                    chartType={chartType}
                    chartConfig={chartConfig}
                    tableName={tableName}
                />
            )}
        </>
    );
};

export default LightdashVisualization;
