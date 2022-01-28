import { DBChartTypes } from 'common';
import EChartsReact from 'echarts-for-react';
import React, { FC, RefObject } from 'react';
import { ChartConfig } from '../../hooks/useChartConfig';
import SimpleChart from '../SimpleChart';
import SimpleTable from '../SimpleTable';

interface Props {
    isLoading: boolean;
    tableName: string | undefined;
    chartRef: RefObject<EChartsReact>;
    chartType: DBChartTypes;
    chartConfig: ChartConfig;
}

const LightdashVisualisation: FC<Props> = ({
    isLoading,
    tableName,
    chartRef,
    chartType,
    chartConfig,
}) => (
    <>
        {chartType === 'table' ? (
            <SimpleTable data={chartConfig.plotData} isLoading={isLoading} />
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

export default LightdashVisualisation;
