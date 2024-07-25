import { type BarChartConfig } from '@lightdash/common';
import EChartsReact, { type EChartsReactProps } from 'echarts-for-react';
import { type FC } from 'react';
import { type ResultsAndColumns } from '../../hooks/useSqlQueryRun';
import { useBarChart } from '../../transformers/useBarChart';

type BarChartProps = {
    data: ResultsAndColumns;
    config: BarChartConfig;
} & Partial<Pick<EChartsReactProps, 'style'>>;

const BarChart: FC<BarChartProps> = ({ data, config, style }) => {
    const spec = useBarChart(data.results, data.columns, config);
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
