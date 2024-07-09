import { type BarChartDataTransformer } from '@lightdash/common';
import { type BarChartConfig } from '@lightdash/common/src/types/visualizations';
import EChartsReact from 'echarts-for-react';
import { type EChartsReactProps } from 'echarts-for-react/lib/types';
import { memo, type FC } from 'react';

type BarChartProps = Omit<EChartsReactProps, 'option'> & {
    transformer: BarChartDataTransformer;
    config: BarChartConfig;
};

const BarChart: FC<BarChartProps> = memo(
    ({ transformer, config, className, ...rest }) => {
        return (
            <EChartsReact
                className={className}
                option={transformer.getEchartsSpec(config)}
                notMerge
                opts={{
                    renderer: 'svg',
                    width: 'auto',
                    height: 'auto',
                }}
                {...rest}
            />
        );
    },
);

export default BarChart;
