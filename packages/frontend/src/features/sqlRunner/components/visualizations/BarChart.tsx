import { type BarChartConfig } from '@lightdash/common';
import { Center, Skeleton } from '@mantine/core';
import EChartsReact, { type EChartsReactProps } from 'echarts-for-react';
import { memo, type FC } from 'react';
import { type ResultsAndColumns } from '../../hooks/useSqlQueryRun';
import { useBarChart } from '../../transformers/useBarChart';

type BarChartProps = {
    data: ResultsAndColumns;
    config: BarChartConfig;
    isLoading: boolean;
} & Partial<Pick<EChartsReactProps, 'style'>>;

const BarChart: FC<BarChartProps> = memo(
    ({ data, config, style, isLoading: isLoadingProp }) => {
        const {
            loading: transformLoading,
            error,
            value: spec,
        } = useBarChart(data.results, data.columns, config);
        const loading = isLoadingProp || transformLoading;

        if (error) {
            return <Center>Error: {error.message}</Center>;
        }

        return (
            <>
                {!spec && <Skeleton h="100%" />}
                {spec && (
                    <EChartsReact
                        option={spec}
                        showLoading={loading}
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
    },
);

export default BarChart;
