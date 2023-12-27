import { Center, Code, Loader } from '@mantine/core';
import { FC, lazy, Suspense, useMemo } from 'react';
import { useCustomVisualizationContext } from './CustomVisualizationProvider/useCustomVisualizationContext';

type CustomVisualizationProps = {
    className?: string;
    'data-testid'?: string;
};

const VegaLite = lazy(() =>
    import('react-vega').then((module) => ({ default: module.VegaLite })),
);

const CustomVisualization: FC<CustomVisualizationProps> = (props) => {
    const { chartConfig, rows } = useCustomVisualizationContext();

    const [config, error] = useMemo(() => {
        try {
            return [
                {
                    ...JSON.parse(chartConfig),
                },
                null,
            ];
        } catch (e) {
            return [null, e];
        }
    }, [chartConfig]);

    if (error) {
        return <Code>{error.toString()}</Code>;
    }

    const data = { table: rows };

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
                        ...config,
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
