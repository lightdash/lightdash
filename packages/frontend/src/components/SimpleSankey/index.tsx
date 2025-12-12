import { IconChartSankey } from '@tabler/icons-react';
import { type EChartsReactProps, type Opts } from 'echarts-for-react/lib/types';
import { memo, useEffect, type FC } from 'react';
import useEchartsSankeyConfig from '../../hooks/echarts/useEchartsSankeyConfig';
import EChartsReact from '../EChartsReactWrapper';
import { useVisualizationContext } from '../LightdashVisualization/useVisualizationContext';
import SuboptimalState from '../common/SuboptimalState/SuboptimalState';

const EmptyChart = () => (
    <div style={{ height: '100%', width: '100%', padding: '50px 0' }}>
        <SuboptimalState
            title="No data available"
            description="Select source, target, and value fields to display a Sankey diagram."
            icon={IconChartSankey}
        />
    </div>
);

const LoadingChart = () => (
    <div style={{ height: '100%', width: '100%', padding: '50px 0' }}>
        <SuboptimalState
            title="Loading chart"
            loading
            className="loading_chart"
        />
    </div>
);

type SimpleSankeyProps = Omit<EChartsReactProps, 'option'> & {
    isInDashboard: boolean;
    $shouldExpand?: boolean;
    className?: string;
    'data-testid'?: string;
};

const EchartOptions: Opts = { renderer: 'svg' };

const SimpleSankey: FC<SimpleSankeyProps> = memo((props) => {
    const { chartRef, isLoading } = useVisualizationContext();

    const sankeyOptions = useEchartsSankeyConfig({
        isInDashboard: props.isInDashboard,
    });

    useEffect(() => {
        const listener = () => chartRef.current?.getEchartsInstance().resize();
        const observer = new ResizeObserver(() => {
            listener();
        });

        if (chartRef.current?.getEchartsInstance().getDom()) {
            observer.observe(chartRef.current?.getEchartsInstance().getDom());
        }
        window.addEventListener('resize', listener);
        return () => {
            window.removeEventListener('resize', listener);
            observer.disconnect();
        };
    });

    if (isLoading) return <LoadingChart />;
    if (!sankeyOptions) return <EmptyChart />;

    return (
        <EChartsReact
            ref={chartRef}
            data-testid={props['data-testid']}
            className={props.className}
            style={
                props.$shouldExpand
                    ? {
                          minHeight: 'inherit',
                          height: '100%',
                          width: '100%',
                      }
                    : {
                          minHeight: 'inherit',
                          // height defaults to 300px
                          width: '100%',
                      }
            }
            opts={EchartOptions}
            option={sankeyOptions.eChartsOption}
            notMerge
            {...props}
        />
    );
});

export default SimpleSankey;
