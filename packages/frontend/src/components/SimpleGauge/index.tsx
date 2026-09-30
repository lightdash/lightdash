import { getGaugeSizes } from '@lightdash/visualization/editor';
import { IconGauge } from '@tabler/icons-react';
import { type EChartsReactProps, type Opts } from 'echarts-for-react/lib/types';
import { memo, useEffect, useMemo, useRef, useState, type FC } from 'react';
import useEchartsGaugeConfig from '../../hooks/echarts/useEchartsGaugeConfig';
import LoadingChart from '../common/LoadingChart';
import SuboptimalState from '../common/SuboptimalState/SuboptimalState';
import EChartsReact from '../EChartsReactWrapper';
import { useVisualizationContext } from '../LightdashVisualization/useVisualizationContext';

const EmptyChart = () => (
    <div style={{ height: '100%', width: '100%', padding: '50px 0' }}>
        <SuboptimalState
            title="No data available"
            description="Query metrics and dimensions with results."
            icon={IconGauge}
        />
    </div>
);

type SimpleGaugeProps = Omit<EChartsReactProps, 'option'> & {
    isInDashboard: boolean;
    $shouldExpand?: boolean;
    className?: string;
    onScreenshotReady?: () => void;
    onScreenshotError?: () => void;
};

const EchartOptions: Opts = { renderer: 'svg' };

const SimpleGauge: FC<SimpleGaugeProps> = memo(
    ({ onScreenshotReady, onScreenshotError, ...props }) => {
        const { chartRef, isLoading } = useVisualizationContext();
        const [chartWidth, setChartWidth] = useState(0);
        const [chartHeight, setChartHeight] = useState(0);

        const hasSignaledScreenshotReady = useRef(false);

        const sizes = useMemo(
            () => getGaugeSizes({ width: chartWidth, height: chartHeight }),
            [chartWidth, chartHeight],
        );

        const gaugeOptions = useEchartsGaugeConfig({
            isInDashboard: props.isInDashboard,
            ...sizes,
        });

        useEffect(() => {
            if (hasSignaledScreenshotReady.current) return;
            if (!onScreenshotReady && !onScreenshotError) return;

            if (!isLoading) {
                onScreenshotReady?.();
                hasSignaledScreenshotReady.current = true;
            }
        }, [isLoading, gaugeOptions, onScreenshotReady, onScreenshotError]);

        useEffect(() => {
            const listener = () =>
                chartRef.current?.getEchartsInstance().resize();
            const observer = new ResizeObserver(([entry]) => {
                const { width, height } = entry.contentRect;
                setChartWidth(width);
                setChartHeight(height);
            });

            if (chartRef.current?.getEchartsInstance().getDom()) {
                observer.observe(
                    chartRef.current?.getEchartsInstance().getDom(),
                );
            }
            window.addEventListener('resize', listener);
            return () => {
                window.removeEventListener('resize', listener);
                observer.disconnect();
            };
        });

        if (isLoading) return <LoadingChart />;
        if (!gaugeOptions) return <EmptyChart />;

        return (
            <>
                <EChartsReact
                    ref={chartRef}
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
    },
);

export default SimpleGauge;
