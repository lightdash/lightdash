import EChartsReact, { type EChartsReactProps } from 'echarts-for-react';
import { type FC } from 'react';
import { type useSqlQueryRun } from '../../hooks/useSqlQueryRun';
import { useAppSelector } from '../../store/hooks';
import { useBarChartDataTransformer } from '../../transformers/useBarChartDataTransformer';

type BarChartProps = {
    data: NonNullable<ReturnType<typeof useSqlQueryRun>['data']>;
} & Partial<Pick<EChartsReactProps, 'style'>>;

const BarChart: FC<BarChartProps> = ({ data, style }) => {
    const config = useAppSelector((state) => state.barChartConfig.config);
    const { spec } = useBarChartDataTransformer(data, config);
    return (
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
    );
};

export default BarChart;
