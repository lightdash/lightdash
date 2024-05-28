import { Center, Loader, Text } from '@mantine/core';
import { lazy, Suspense, type FC } from 'react';
import { type CustomVisualizationConfigAndData } from '../../hooks/useCustomVisualizationConfig';
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
    const { isLoading, visualizationConfig } = useVisualizationContext();

    if (isLoading) {
        return <Text>Loading...</Text>;
    }

    if (!isCustomVisualizationConfig(visualizationConfig)) return null;
    const spec = visualizationConfig.chartConfig.validConfig.spec;

    if (
        !visualizationConfig ||
        !isCustomVisualizationConfig(visualizationConfig) ||
        !spec
    ) {
        return null;
    }

    // TODO: 'chartConfig' is more props than config. It has data and
    // configuration for the chart. We should consider renaming it generally.
    const visProps =
        visualizationConfig.chartConfig as CustomVisualizationConfigAndData;

    const data = { values: visProps.series };

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

                        data: { name: 'values' },
                    }}
                    data={data}
                    actions={false}
                />
            </Suspense>
        </div>
    );
};

export default CustomVisualization;
