import EChartsReact from 'echarts-for-react';
import { type EChartsReactProps } from 'echarts-for-react/lib/types';
import { memo, type FC } from 'react';
import { type useSqlQueryRun } from '../../hooks/useSqlQueryRun';
import { useAppSelector } from '../../store/hooks';
import { useBarChartDataTransformer } from '../../transformers/useBarChartDataTransformer';

type BarChartProps = Omit<EChartsReactProps, 'option'> & {
    data: NonNullable<ReturnType<typeof useSqlQueryRun>['data']>;
};

const BarChart: FC<BarChartProps> = memo(({ data, ...rest }) => {
    const barChartConfig = useAppSelector(
        (state) => state.sqlRunner.chartConfig,
    );
    const { spec } = useBarChartDataTransformer(data, barChartConfig);

    return (
        <EChartsReact
            option={spec}
            notMerge
            opts={{
                renderer: 'svg',
                width: 'auto',
                height: 'auto',
            }}
            {...rest}
        />
    );
});

export default BarChart;
