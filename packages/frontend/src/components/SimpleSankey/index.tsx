import { Box } from '@mantine-8/core';
import { IconFilterOff } from '@tabler/icons-react';
import { type EChartsReactProps, type Opts } from 'echarts-for-react/lib/types';
import { memo, useEffect, useRef, type FC } from 'react';
import useEchartsSankeyConfig from '../../hooks/echarts/useEchartsSankeyConfig';
import LoadingChart from '../common/LoadingChart';
import SuboptimalState from '../common/SuboptimalState/SuboptimalState';
import EChartsReact from '../EChartsReactWrapper';
import { useVisualizationContext } from '../LightdashVisualization/useVisualizationContext';

const EmptyChart = () => (
    <Box h="100%" w="100%" py="xl">
        <SuboptimalState
            title="No data available"
            description="Select a source dimension, a target dimension, and a weight metric to create a Sankey diagram. Multi-level flows are supported when nodes appear as both source and target."
            icon={IconFilterOff}
        />
    </Box>
);

type SimpleSankeyProps = Omit<EChartsReactProps, 'option'> & {
    isInDashboard: boolean;
    $shouldExpand?: boolean;
    className?: string;
    onScreenshotReady?: () => void;
    onScreenshotError?: () => void;
};

const EchartOptions: Opts = { renderer: 'svg' };

const SimpleSankey: FC<SimpleSankeyProps> = memo(
    ({ onScreenshotReady, onScreenshotError, ...props }) => {
        const { chartRef, isLoading, resultsData } = useVisualizationContext();

        const sankeyChartOptions = useEchartsSankeyConfig(props.isInDashboard);

        const hasSignaledScreenshotReady = useRef(false);

        useEffect(() => {
            if (hasSignaledScreenshotReady.current) return;
            if (!onScreenshotReady && !onScreenshotError) return;
            if (!isLoading) {
                onScreenshotReady?.();
                hasSignaledScreenshotReady.current = true;
            }
        }, [
            isLoading,
            sankeyChartOptions,
            onScreenshotReady,
            onScreenshotError,
        ]);

        useEffect(() => {
            // Load all rows
            resultsData?.setFetchAll(true);
        }, [resultsData]);

        useEffect(() => {
            const eCharts = chartRef.current?.getEchartsInstance();
            const dom = eCharts?.getDom();
            if (!eCharts || !dom) return;

            let rafId: number | null = null;
            const resizeChart = () => {
                if (rafId !== null) return;
                rafId = requestAnimationFrame(() => {
                    eCharts.resize();
                    rafId = null;
                });
            };

            const observer = new ResizeObserver(resizeChart);
            observer.observe(dom);
            window.addEventListener('resize', resizeChart);

            return () => {
                window.removeEventListener('resize', resizeChart);
                observer.disconnect();
                if (rafId !== null) cancelAnimationFrame(rafId);
            };
        }, [chartRef, sankeyChartOptions]);

        if (isLoading) return <LoadingChart />;
        if (!sankeyChartOptions) return <EmptyChart />;

        return (
            <EChartsReact
                ref={chartRef}
                className={props.className}
                style={
                    props.$shouldExpand
                        ? {
                              minHeight: 'inherit',
                              height: '100%',
                              width: '100%',
                              overflow: 'hidden',
                          }
                        : {
                              minHeight: 'inherit',
                              width: '100%',
                              overflow: 'hidden',
                          }
                }
                opts={EchartOptions}
                option={sankeyChartOptions}
                notMerge
                {...props}
            />
        );
    },
);

export default SimpleSankey;
