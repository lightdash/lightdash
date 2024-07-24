import { type BarChartConfig } from '@lightdash/common';
import EChartsReact, { type EChartsReactProps } from 'echarts-for-react';
import { type FC } from 'react';
import { type useSqlQueryRun } from '../../hooks/useSqlQueryRun';
import { useBarChartDataTransformer } from '../../transformers/useBarChartDataTransformer';

type BarChartProps = {
    data: NonNullable<ReturnType<typeof useSqlQueryRun>['data']>;
    config?: BarChartConfig;
} & Partial<Pick<EChartsReactProps, 'style'>>;

const BarChart: FC<BarChartProps> = ({ data, config, style }) => {
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
