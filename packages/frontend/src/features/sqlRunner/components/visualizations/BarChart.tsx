import { type BarChartConfig, type ResultRow } from '@lightdash/common';
import EChartsReact, { type EChartsReactProps } from 'echarts-for-react';
import { type FC } from 'react';
import { useBarChartDataTransformer } from '../../transformers/useBarChartDataTransformer';

type BarChartProps = {
    data: ResultRow[];
    config: BarChartConfig | undefined;
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
