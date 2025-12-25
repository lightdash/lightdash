import { IconChartTreemap } from '@tabler/icons-react';
import { type EChartsReactProps, type Opts } from 'echarts-for-react/lib/types';
import { memo, useEffect, useRef, type FC } from 'react';
import useEchartsTreemapConfig from '../../hooks/echarts/useEchartsTreemapConfig';
import EChartsReact from '../EChartsReactWrapper';
import { useVisualizationContext } from '../LightdashVisualization/useVisualizationContext';
import LoadingChart from '../common/LoadingChart';
import SuboptimalState from '../common/SuboptimalState/SuboptimalState';

const EmptyChart = () => (
    <div style={{ height: '100%', width: '100%', padding: '50px 0' }}>
        <SuboptimalState
            title="No data available"
            description="Query metrics and dimensions with results."
            icon={IconChartTreemap}
        />
    </div>
);

type SimpleTreemapProps = Omit<EChartsReactProps, 'option'> & {
    isInDashboard: boolean;
    $shouldExpand?: boolean;
    className?: string;
    'data-testid'?: string;
    onScreenshotReady?: () => void;
    onScreenshotError?: () => void;
};

const EchartOptions: Opts = { renderer: 'svg' };

const SimpleTreemap: FC<SimpleTreemapProps> = memo(
    ({ onScreenshotReady, onScreenshotError, ...props }) => {
        const { chartRef, isLoading, resultsData } = useVisualizationContext();

        const treemapOptions = useEchartsTreemapConfig(props.isInDashboard);

        const hasSignaledScreenshotReady = useRef(false);

        useEffect(() => {
            if (hasSignaledScreenshotReady.current) return;
            if (!onScreenshotReady && !onScreenshotError) return;

            if (!isLoading) {
                onScreenshotReady?.();
                hasSignaledScreenshotReady.current = true;
            }
        }, [isLoading, treemapOptions, onScreenshotReady, onScreenshotError]);

        useEffect(() => {
            resultsData?.setFetchAll(true);
        }, [resultsData]);

        useEffect(() => {
            const listener = () =>
                chartRef.current?.getEchartsInstance().resize();
            window.addEventListener('resize', listener);
            return () => window.removeEventListener('resize', listener);
        });

        if (isLoading) return <LoadingChart />;
        if (!treemapOptions) return <EmptyChart />;

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
                    option={treemapOptions.eChartsOption}
                    notMerge
                    {...props}
                />
            </>
        );
    },
);

export default SimpleTreemap;
