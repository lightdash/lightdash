import { DBChartTypes, SavedQuery } from 'common';
import EChartsReact from 'echarts-for-react';
import React, { FC, RefObject } from 'react';
import { useChartConfig } from '../../hooks/useChartConfig';
import { useQueryResults } from '../../hooks/useQueryResults';
import { useExplorer } from '../../providers/ExplorerProvider';
import { LoadingState } from '../ResultsTable/States';
import SimpleChart from '../SimpleChart';
import SimpleStatistic from '../SimpleStatistic';

interface Props {
    chartRef: RefObject<EChartsReact>;
    chartType: DBChartTypes;
    savedData: SavedQuery | undefined;
}

const LightdashVisualisation: FC<Props> = ({
    savedData,
    chartRef,
    chartType,
}) => {
    const { data, isLoading } = useQueryResults();
    const {
        state: { tableName },
    } = useExplorer();
    const chartConfig = useChartConfig(
        tableName,
        data,
        savedData?.chartConfig.seriesLayout,
    );

    if (isLoading) {
        return <LoadingState />;
    }
    return (
        <>
            {chartType === DBChartTypes.BIG_NUMBER ? (
                <SimpleStatistic
                    data={data}
                    label={
                        chartConfig.metricOptions[0] &&
                        chartConfig.metricOptions[0].label
                    }
                />
            ) : (
                <SimpleChart
                    isLoading={isLoading}
                    chartRef={chartRef}
                    chartType={chartType}
                    chartConfig={chartConfig}
                />
            )}
        </>
    );
};

export default LightdashVisualisation;
