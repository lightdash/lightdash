import { NonIdealState, Spinner } from '@blueprintjs/core';
import { ECElementEvent } from 'echarts';
import EChartsReact from 'echarts-for-react';
import { EChartsReactProps, Opts } from 'echarts-for-react/lib/types';
import { FC, memo, useCallback, useEffect } from 'react';
import useEchartsPieConfig from '../../hooks/echarts/useEchartsPieChart';
import { useVisualizationContext } from '../LightdashVisualization/VisualizationProvider';

const EmptyChart = () => (
    <div style={{ height: '100%', width: '100%', padding: '50px 0' }}>
        <NonIdealState
            title="No data available"
            description="Query metrics and dimensions with results."
            icon="chart"
        />
    </div>
);

const LoadingChart = () => (
    <div style={{ height: '100%', width: '100%', padding: '50px 0' }}>
        <NonIdealState title="Loading chart" icon={<Spinner />} />
    </div>
);

type SimplePieChartProps = Omit<EChartsReactProps, 'option'> & {
    $shouldExpand?: boolean;
    className?: string;
    'data-testid'?: string;
};

const EchartOptions: Opts = { renderer: 'svg' };

const SimplePieChart: FC<SimplePieChartProps> = memo((props) => {
    const { chartRef, isLoading } = useVisualizationContext();
    const pieChartOptions = useEchartsPieConfig();

    useEffect(() => {
        const listener = () => chartRef.current?.getEchartsInstance().resize();
        window.addEventListener('resize', listener);
        return () => window.removeEventListener('resize', listener);
    });

    const handleMenuOpen = useCallback((e: ECElementEvent) => {
        if (e.componentType !== 'series' || e.componentSubType !== 'pie')
            return;
    }, []);

    if (isLoading) return <LoadingChart />;
    if (!pieChartOptions) return <EmptyChart />;

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
            option={pieChartOptions}
            notMerge
            onEvents={{
                contextmenu: handleMenuOpen,
                click: handleMenuOpen,
            }}
            {...props}
        />
    );
});

export default SimplePieChart;
