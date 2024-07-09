import EChartsReact from 'echarts-for-react';
import { type EChartsReactProps } from 'echarts-for-react/lib/types';
import { memo, type FC } from 'react';
import { useSelector } from 'react-redux';
import { type useSqlQueryRun } from '../../hooks/useSqlQueryRun';
import { useBarChartDataTransformer } from '../../transformers/useBarChartDataTransformer';

type BarChartProps = Omit<EChartsReactProps, 'option'> & {
    data: NonNullable<ReturnType<typeof useSqlQueryRun>['data']>;
};

const BarChart: FC<BarChartProps> = memo(({ data, className, ...rest }) => {
    // TODO: fix store type
    const barChartConfig = useSelector(
        (state: any) => state.sqlRunner.chartConfig,
    );
    const { spec } = useBarChartDataTransformer(data, barChartConfig);

    return (
        <EChartsReact
            className={className}
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
