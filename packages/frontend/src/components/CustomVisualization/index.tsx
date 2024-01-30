import { Center, Code, Loader, Text } from '@mantine/core';
import { FC, lazy, Suspense, useMemo } from 'react';
import { CustomVisualizationProps } from '../../hooks/useCustomVisualizationConfig';
import { isCustomVisualizationConfig } from '../LightdashVisualization/VisualizationCustomConfig';
import { useVisualizationContext } from '../LightdashVisualization/VisualizationProvider';

const VegaLite = lazy(() =>
    import('react-vega').then((module) => ({ default: module.VegaLite })),
);

type Props = {
    className?: string;
    'data-testid'?: string;
};

const CustomVisualization: FC<Props> = (props) => {
    // TODO: isSqlRunner
    const { isLoading, visualizationConfig } = useVisualizationContext();

    const [spec, error] = useMemo(() => {
        try {
            if (!isCustomVisualizationConfig(visualizationConfig))
                return [null, 'Invalid config for custom visualization'];
            return [
                {
                    ...JSON.parse(
                        visualizationConfig.chartConfig.validConfig.spec || '',
                    ),
                },
                null,
            ];
        } catch (e) {
            return [null, e];
        }
    }, [visualizationConfig]);

    if (error) {
        return <Code>{error.toString()}</Code>;
    }

    if (isLoading) {
        return <Text>Loading...</Text>;
    }

    if (
        !visualizationConfig ||
        !isCustomVisualizationConfig(visualizationConfig)
    ) {
        return null;
    }

    // TODO: 'chartConfig' is more props than config. It has data and
    // configuration for the chart. We should consider renaming it generally.
    const visProps =
        visualizationConfig.chartConfig as CustomVisualizationProps;

    const data = { table: visProps.series };

    return (
        <div
            data-testid={props['data-testid']}
            className={props.className}
            style={{
                minHeight: 'inherit',
                height: '100%',
                width: '100%',
            }}
        >
            <Suspense
                fallback={
                    <Center>
                        <Loader color="gray" />
                    </Center>
                }
            >
                <VegaLite
                    style={{
                        width: 'inherit',
                        height: 'inherit',
                        minHeight: 'inherit',
                    }}
                    config={{
                        autosize: {
                            resize: true,
                            type: 'fit',
                        },
                    }}
                    spec={{
                        ...spec,
                        width: 'container',
                        height: 'container',
                        data: { name: 'table' },
                    }}
                    data={data}
                />
            </Suspense>
        </div>
    );
};

export default CustomVisualization;
