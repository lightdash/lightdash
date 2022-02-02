import { DBChartTypes } from 'common';
import EChartsReact from 'echarts-for-react';
import React, { FC, RefObject } from 'react';
import { ChartConfig } from '../../hooks/useChartConfig';
import { LoadingState } from '../ResultsTable/States';
import SimpleChart from '../SimpleChart';
import SimpleTable from '../SimpleTable';

interface Props {
    isLoading: boolean;
    tableName: string | undefined;
    chartRef: RefObject<EChartsReact>;
    chartType: DBChartTypes;
    chartConfig: ChartConfig;
}

const LightdashVisualization: FC<Props> = ({
    isLoading,
    tableName,
    chartRef,
    chartType,
    chartConfig,
}) => {
    if (isLoading || !chartConfig.plotData) {
        return <LoadingState />;
    }
    return (
        <>
            {chartType === 'table' ? (
                <SimpleTable data={chartConfig.plotData} />
            ) : (
                <SimpleChart
                    isLoading={isLoading}
                    tableName={tableName}
                    chartRef={chartRef}
                    chartType={
                        chartType as Exclude<DBChartTypes, DBChartTypes.TABLE>
                    }
                    chartConfig={chartConfig}
                />
            )}
        </>
    );
};

export default LightdashVisualization;
