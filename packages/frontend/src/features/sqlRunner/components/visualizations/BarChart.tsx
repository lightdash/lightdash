import { type BarChartConfig } from '@lightdash/common';
import { Center } from '@mantine/core';
import EChartsReact, { type EChartsReactProps } from 'echarts-for-react';
import { type FC } from 'react';
import { type ResultsAndColumns } from '../../hooks/useSqlQueryRun';
import { useBarChart } from '../../transformers/useBarChart';

type BarChartProps = {
    data: ResultsAndColumns;
    config: BarChartConfig;
} & Partial<Pick<EChartsReactProps, 'style'>>;

const BarChart: FC<BarChartProps> = ({ data, config, style }) => {
    const { error, value: spec } = useBarChart(
        data.results,
        data.columns,
        config,
    );

    if (error) {
        return <Center>Error: {error.message}</Center>;
    }

    return (
        <>
            {spec && (
                <EChartsReact
                    option={spec}
                    notMerge
                    opts={{
                        renderer: 'svg',
                        width: 'auto',
                        height: 'auto',
                    }}
                    style={style}
                />
            )}
        </>
    );
};

export default BarChart;
