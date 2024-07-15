import { type BarChartConfig } from '@lightdash/common';
import EChartsReact from 'echarts-for-react';
import { type FC } from 'react';
import { type useSqlQueryRun } from '../../hooks/useSqlQueryRun';
import { useBarChartDataTransformer } from '../../transformers/useBarChartDataTransformer';

type BarChartProps = {
    data: NonNullable<ReturnType<typeof useSqlQueryRun>['data']>;
    config: BarChartConfig | undefined;
};

const BarChart: FC<BarChartProps> = ({ data, config }) => {
    const { spec } = useBarChartDataTransformer(data, config);
    return (
        <EChartsReact
            option={spec}
            notMerge
            opts={{
                renderer: 'svg',
            }}
            style={{
                minHeight: 'inherit',
                height: '100%',
                width: '100%',
            }}
        />
    );
};

export default BarChart;
