import { DBChartTypes } from 'common';
import EChartsReact from 'echarts-for-react';
import React, { FC, RefObject } from 'react';
import { ChartConfig } from '../../hooks/useChartConfig';
import { LoadingState } from '../ResultsTable/States';
import SimpleChart from '../SimpleChart';
import SimpleStatistic from '../SimpleStatistic';

interface Props {
    isLoading: boolean;
    tableName: string | undefined;
    chartRef: RefObject<EChartsReact>;
    chartType: DBChartTypes;
    chartConfig: ChartConfig;
    bigNumberData: { bigNumber: string | number; bigNumberLabel: string };
}

const LightdashVisualisation: FC<Props> = ({
    isLoading,
    tableName,
    chartRef,
    chartType,
    chartConfig,
    bigNumberData,
}) => {
    if (isLoading && !chartConfig) {
        return <LoadingState />;
    }
    return (
        <>
            {chartType === 'big_number' ? (
                <SimpleStatistic
                    bigNumber={bigNumberData.bigNumber}
                    bigNumberLabel={bigNumberData.bigNumberLabel}
                />
            ) : (
                <SimpleChart
                    isLoading={isLoading}
                    tableName={tableName}
                    chartRef={chartRef}
                    chartType={chartType}
                    chartConfig={chartConfig}
                />
            )}
        </>
    );
};

export default LightdashVisualisation;
