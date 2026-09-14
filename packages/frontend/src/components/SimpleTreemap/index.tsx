import { IconChartTreemap } from '@tabler/icons-react';
import { type EChartsReactProps, type Opts } from 'echarts-for-react/lib/types';
import { memo, useCallback, useEffect, useMemo, useRef, type FC } from 'react';
import useEchartsTreemapConfig from '../../hooks/echarts/useEchartsTreemapConfig';
import LoadingChart from '../common/LoadingChart';
import SuboptimalState from '../common/SuboptimalState/SuboptimalState';
import EChartsReact from '../EChartsReactWrapper';
import { isTreemapVisualizationConfig } from '../LightdashVisualization/types';
import { useVisualizationContext } from '../LightdashVisualization/useVisualizationContext';

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
    onScreenshotReady?: () => void;
    onScreenshotError?: () => void;
};

const EchartOptions: Opts = { renderer: 'svg' };

const SimpleTreemap: FC<SimpleTreemapProps> = memo(
    ({
        onScreenshotReady,
        onScreenshotError,
        onEvents,
        onChartReady,
        ...props
    }) => {
        const { chartRef, isLoading, resultsData, visualizationConfig } =
            useVisualizationContext();
        const treemapConfig = isTreemapVisualizationConfig(visualizationConfig)
            ? visualizationConfig.chartConfig
            : undefined;
        const screenshotError =
            resultsData?.error ?? treemapConfig?.subtotalsError;

        const treemapOptions = useEchartsTreemapConfig(props.isInDashboard);

        const hasSignaledScreenshotReady = useRef(false);

        const signalScreenshotReady = useCallback(() => {
            if (hasSignaledScreenshotReady.current || !onScreenshotReady)
                return;
            if (
                isLoading ||
                screenshotError ||
                !resultsData?.hasFetchedAllRows ||
                treemapConfig?.isLoadingSubtotals
            )
                return;

            hasSignaledScreenshotReady.current = true;
            onScreenshotReady();
        }, [
            isLoading,
            screenshotError,
            resultsData?.hasFetchedAllRows,
            treemapConfig?.isLoadingSubtotals,
            onScreenshotReady,
        ]);

        const chartEvents = useMemo(
            () => ({
                ...onEvents,
                finished: (...args: unknown[]) => {
                    signalScreenshotReady();
                    onEvents?.finished?.(...args);
                },
            }),
            [onEvents, signalScreenshotReady],
        );

        const handleChartReady = useCallback<
            NonNullable<EChartsReactProps['onChartReady']>
        >(
            (instance) => {
                onChartReady?.(instance);
                // The initial synchronous render can finish before echarts-for-react binds events.
                if (onScreenshotReady) instance.getZr().refresh();
            },
            [onChartReady, onScreenshotReady],
        );

        useEffect(() => {
            if (!treemapOptions) signalScreenshotReady();
        }, [treemapOptions, signalScreenshotReady]);

        useEffect(() => {
            if (hasSignaledScreenshotReady.current || !onScreenshotError)
                return;
            if (screenshotError) {
                hasSignaledScreenshotReady.current = true;
                onScreenshotError();
            }
        }, [screenshotError, onScreenshotError]);

        useEffect(() => {
            resultsData?.setFetchAll(true);
        }, [resultsData]);

        useEffect(() => {
            const listener = () =>
                chartRef.current?.getEchartsInstance().resize();
            window.addEventListener('resize', listener);
            return () => window.removeEventListener('resize', listener);
        });

        if (screenshotError) return <EmptyChart />;
        if (isLoading) return <LoadingChart />;
        if (!treemapOptions) return <EmptyChart />;

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
                    option={treemapOptions.eChartsOption}
                    notMerge
                    {...props}
                    onEvents={chartEvents}
                    onChartReady={handleChartReady}
                    lazyUpdate={onScreenshotReady ? false : props.lazyUpdate}
                />
            </>
        );
    },
);

export default SimpleTreemap;
