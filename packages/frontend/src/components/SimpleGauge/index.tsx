import { IconGauge } from '@tabler/icons-react';
import { type EChartsReactProps, type Opts } from 'echarts-for-react/lib/types';
import { memo, useEffect, type FC } from 'react';
import useEchartsGaugeConfig from '../../hooks/echarts/useEchartsGaugeConfig';
import EChartsReact from '../EChartsReactWrapper';
import { useVisualizationContext } from '../LightdashVisualization/useVisualizationContext';
import SuboptimalState from '../common/SuboptimalState/SuboptimalState';

const EmptyChart = () => (
    <div style={{ height: '100%', width: '100%', padding: '50px 0' }}>
        <SuboptimalState
            title="No data available"
            description="Query metrics and dimensions with results."
            icon={IconGauge}
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

type SimpleGaugeProps = Omit<EChartsReactProps, 'option'> & {
    isInDashboard: boolean;
    $shouldExpand?: boolean;
    className?: string;
    'data-testid'?: string;
};

const EchartOptions: Opts = { renderer: 'svg' };

const SimpleGauge: FC<SimpleGaugeProps> = memo((props) => {
    const { chartRef, isLoading, resultsData } = useVisualizationContext();

    const gaugeOptions = useEchartsGaugeConfig(props.isInDashboard);

    useEffect(() => {
        // Load all the rows
        resultsData?.setFetchAll(true);
    }, [resultsData]);

    useEffect(() => {
        const listener = () => chartRef.current?.getEchartsInstance().resize();
        window.addEventListener('resize', listener);
        return () => window.removeEventListener('resize', listener);
    });

    if (isLoading) return <LoadingChart />;
    if (!gaugeOptions) return <EmptyChart />;

    return (
        <>
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
                option={gaugeOptions.eChartsOption}
                notMerge
                {...props}
            />
        </>
    );
});

export default SimpleGauge;
