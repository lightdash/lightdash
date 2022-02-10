import { ApiQueryResults, DBChartTypes } from 'common';
import EChartsReact from 'echarts-for-react';
import React, { FC, RefObject } from 'react';
import { ChartConfig } from '../../hooks/useChartConfig';
import { LoadingState } from '../ResultsTable/States';
import SimpleChart from '../SimpleChart';
import SimpleStatistic from '../SimpleStatistic';
import SimpleTable from '../SimpleTable';

interface Props {
    chartRef: RefObject<EChartsReact>;
    chartType: DBChartTypes;
    chartConfig: ChartConfig;
    tableName: string | undefined;
    resultsData: ApiQueryResults | undefined;
    isLoading: boolean;
}

const LightdashVisualization: FC<Props> = ({
    chartConfig,
    chartRef,
    chartType,
    tableName,
    resultsData,
    isLoading,
}) => {
    if (isLoading || !chartConfig) {
        return <LoadingState />;
    }

    const renderType = () => {
        switch (chartType) {
            case DBChartTypes.BIG_NUMBER:
                return (
                    <SimpleStatistic
                        data={resultsData}
                        label={
                            chartConfig.metricOptions[0] &&
                            chartConfig.metricOptions[0].label
                        }
                    />
                );
            case DBChartTypes.TABLE:
                return <SimpleTable data={chartConfig.plotData} />;
            case DBChartTypes.COLUMN:
            case DBChartTypes.LINE:
            case DBChartTypes.SCATTER:
            case DBChartTypes.BAR:
                return (
                    <SimpleChart
                        isLoading={isLoading}
                        chartRef={chartRef}
                        chartType={chartType}
                        chartConfig={chartConfig}
                        tableName={tableName}
                    />
                );
            default:
                return null;
        }
    };
    return <>{renderType()}</>;
};

export default LightdashVisualization;
