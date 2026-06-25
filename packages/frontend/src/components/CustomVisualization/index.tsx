import { Anchor, Text, useMantineColorScheme } from '@mantine-8/core';
import { IconGraphOff } from '@tabler/icons-react';
import {
    lazy,
    Suspense,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    type FC,
} from 'react';
import { dark as vegaDarkTheme } from 'vega-themes';
import { type CustomVisualizationConfigAndData } from '../../hooks/useCustomVisualizationConfig';
import LoadingChart from '../common/LoadingChart';
import SuboptimalState from '../common/SuboptimalState/SuboptimalState';
import { isCustomVisualizationConfig } from '../LightdashVisualization/types';
import { useVisualizationContext } from '../LightdashVisualization/useVisualizationContext';
import { vegaStyleConfig } from './vegaConfig';

const VegaEmbed = lazy(async () => {
    const module = await import('react-vega');
    return { default: module.VegaEmbed };
});

type Props = {
    className?: string;
    onScreenshotReady?: () => void;
    onScreenshotError?: () => void;
};

const CustomVisualization: FC<Props> = ({
    onScreenshotReady,
    onScreenshotError,
    ...props
}) => {
    const { colorScheme } = useMantineColorScheme();
    const isDarkMode = colorScheme === 'dark';

    const {
        isLoading,
        visualizationConfig,
        resultsData,
        containerWidth,
        containerHeight,
    } = useVisualizationContext();

    const hasSignaledScreenshotReady = useRef(false);

    // Vega and Vega-Lite Config types are structurally incompatible
    // (e.g. FontWeight vs number, ExprRef vs SignalRef), so we bypass checking here.
    const vegaConfig: Record<string, unknown> = useMemo(
        () => ({
            ...(isDarkMode ? vegaDarkTheme : {}),
            ...vegaStyleConfig,
        }),
        [isDarkMode],
    );

    const handleVegaEmbed = useCallback(() => {
        if (hasSignaledScreenshotReady.current) return;
        onScreenshotReady?.();
        hasSignaledScreenshotReady.current = true;
    }, [onScreenshotReady]);

    const handleVegaError = useCallback(() => {
        if (hasSignaledScreenshotReady.current) return;
        onScreenshotError?.();
        hasSignaledScreenshotReady.current = true;
    }, [onScreenshotError]);

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

    // Vega-Embed measures the container synchronously when the spec is embedded.
    // useElementSize() reports 0 until ResizeObserver fires, so mounting VegaEmbed
    // before the container has been measured produces an SVG locked at 0x0 that
    // never recovers. Wait for a real measurement before handing the spec to Vega.
    if (!containerWidth || !containerHeight) {
        return <LoadingChart />;
    }

    return (
        <div
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
                        width: containerWidth,
                        // @ts-ignore, see above
                        height: containerHeight,
                        // @ts-ignore, see above
                        data: data,
                        // Merge configs: our defaults first, then user's config overrides
                        config: {
                            ...vegaConfig,
                            ...(spec.config || {}),
                        },
                    }}
                    options={{
                        actions: false,
                        // Use Vega's AST expression interpreter instead of
                        // compiling expressions with `Function()`, so custom
                        // visualizations render under a strict CSP (no
                        // 'unsafe-eval'). See issue #21276.
                        ast: true,
                    }}
                    onEmbed={handleVegaEmbed}
                    onError={handleVegaError}
                />
            </Suspense>
        </div>
    );
};

export default CustomVisualization;
