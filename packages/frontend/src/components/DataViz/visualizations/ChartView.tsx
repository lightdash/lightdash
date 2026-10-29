import { isVizTableConfig, type AllVizChartConfig } from '@lightdash/common';
import { Box, LoadingOverlay } from '@mantine/core';
import { type SerializedError } from '@reduxjs/toolkit';
import { IconAlertCircle } from '@tabler/icons-react';
import { clsx } from 'clsx';
import { memo } from 'react';
import SuboptimalState from '../../common/SuboptimalState/SuboptimalState';
import EChartsReact, {
    type EChartsReactProps,
} from '../../EChartsReactWrapper';

type Props = {
    onChartReady?: EChartsReactProps['onChartReady'];
    config: AllVizChartConfig | undefined;
    spec: EChartsReactProps['option'];
    isLoading: boolean;
    error?: SerializedError | null;
    className?: string;
};

const ChartView = memo<Props>(
    ({ config, isLoading, error, className, spec, onChartReady }) => {
        if (isVizTableConfig(config)) {
            throw new Error(
                'VizChartView should not be used for table visualization',
            );
        }

        if (
            config &&
            (!config.fieldConfig?.x || config.fieldConfig.y.length === 0)
        ) {
            return (
                <SuboptimalState
                    title="Incomplete chart configuration"
                    description={
                        !config.fieldConfig?.x
                            ? "You're missing an X axis"
                            : "You're missing a Y axis"
                    }
                    icon={IconAlertCircle}
                    mt="xl"
                />
            );
        }

        if (error && !isLoading) {
            return (
                <SuboptimalState
                    title="Error generating chart"
                    description={error.message}
                    icon={IconAlertCircle}
                    mt="xl"
                />
            );
        }

        return (
            <Box
                h="100%"
                w="100%"
                pos="relative"
                data-testid={`chart-view-${config?.type}`}
            >
                <LoadingOverlay
                    visible={isLoading}
                    loaderProps={{ color: 'gray' }}
                />

                {spec && (
                    <EChartsReact
                        className={clsx(
                            'sentry-block ph-no-capture',
                            className,
                        )}
                        option={spec}
                        notMerge
                        opts={{ renderer: 'svg' }}
                        // oxlint-disable-next-line lightdash-ui/no-inline-style-prop
                        style={{ height: '100%', width: '100%' }}
                        onChartReady={onChartReady}
                    />
                )}
            </Box>
        );
    },
);

export default ChartView;
