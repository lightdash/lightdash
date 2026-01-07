import { Anchor, Text } from '@mantine/core';
import { IconGraphOff } from '@tabler/icons-react';
import { Suspense, lazy, useEffect, useRef, type FC } from 'react';
import { type CustomVisualizationConfigAndData } from '../../hooks/useCustomVisualizationConfig';
import { isCustomVisualizationConfig } from '../LightdashVisualization/types';
import { useVisualizationContext } from '../LightdashVisualization/useVisualizationContext';
import LoadingChart from '../common/LoadingChart';
import SuboptimalState from '../common/SuboptimalState/SuboptimalState';

const VegaEmbed = lazy(() =>
    import('react-vega').then((module) => ({ default: module.VegaEmbed })),
);

type Props = {
    className?: string;
    'data-testid'?: string;
    onScreenshotReady?: () => void;
    onScreenshotError?: () => void;
};

const CustomVisualization: FC<Props> = ({
    onScreenshotReady,
    onScreenshotError,
    ...props
}) => {
    const {
        isLoading,
        visualizationConfig,
        resultsData,
        containerWidth,
        containerHeight,
    } = useVisualizationContext();

    const hasSignaledScreenshotReady = useRef(false);

    useEffect(() => {
        if (hasSignaledScreenshotReady.current) return;
        if (!onScreenshotReady && !onScreenshotError) return;
        if (!isLoading) {
            onScreenshotReady?.();
            hasSignaledScreenshotReady.current = true;
        }
    }, [isLoading, visualizationConfig, onScreenshotReady, onScreenshotError]);

    useEffect(() => {
        // Load all the rows
        resultsData?.setFetchAll(true);
    }, [resultsData]);

    if (!isCustomVisualizationConfig(visualizationConfig)) return null;
    const spec = visualizationConfig.chartConfig.validConfig.spec;

    if (isLoading) {
        return <LoadingChart />;
    }

    if (
        !visualizationConfig ||
        !isCustomVisualizationConfig(visualizationConfig) ||
        !spec
    ) {
        return (
            <div style={{ height: '100%', width: '100%', padding: '50px 0' }}>
                <SuboptimalState
                    title="No visualization loaded"
                    description={
                        <Text>
                            Start by entering your{' '}
                            <Anchor
                                href="https://vega.github.io/vega-lite/examples/"
                                target="_blank"
                            >
                                Vega-Lite JSON
                            </Anchor>{' '}
                            code or choose from our pre-built templates to
                            create your chart.
                        </Text>
                    }
                    icon={IconGraphOff}
                />
            </div>
        );
    }

    // TODO: 'chartConfig' is more props than config. It has data and
    // configuration for the chart. We should consider renaming it generally.
    const visProps =
        visualizationConfig.chartConfig as CustomVisualizationConfigAndData;

    // Show empty state if there's no data
    if (!visProps.series || visProps.series.length === 0) {
        return (
            <div style={{ height: '100%', width: '100%', padding: '50px 0' }}>
                <SuboptimalState
                    title="No data available"
                    description="Query metrics and dimensions with results."
                    icon={IconGraphOff}
                />
            </div>
        );
    }

    const data = { values: visProps.series };

    return (
        <div
            data-testid={props['data-testid']}
            className={props.className}
            style={{
                minHeight: 'inherit',
                height: '100%',
                width: '100%',
                overflow: 'hidden',
            }}
        >
            <Suspense fallback={<LoadingChart />}>
                <VegaEmbed
                    style={{
                        width: containerWidth,
                        height: containerHeight,
                    }}
                    // TODO: We are ignoring some typescript errors here because the type
                    // that vegalite expects doesn't include a few of the properties
                    // that are required to make data and layout properties work. This
                    // might be a mismatch in which of the vega spec union types gets
                    // picked, or a bug in the vegalite typescript definitions.
                    // @ts-ignore
                    spec={{
                        ...spec,
                        // @ts-ignore, see above
                        width: 'container',
                        // @ts-ignore, see above
                        height: 'container',
                        data: data,
                        config: {
                            font: 'Inter, sans-serif',
                            autosize: {
                                type: 'fit',
                                resize: true,
                            },
                        },
                    }}
                    options={{
                        actions: false,
                    }}
                />
            </Suspense>
        </div>
    );
};

export default CustomVisualization;
