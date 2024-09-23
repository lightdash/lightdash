import { isVizTableConfig, type AllVizChartConfig } from '@lightdash/common';
import { LoadingOverlay } from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';
import EChartsReact, { type EChartsReactProps } from 'echarts-for-react';
import { memo } from 'react';
import SuboptimalState from '../../common/SuboptimalState/SuboptimalState';

type Props = {
    config: AllVizChartConfig | undefined;
    spec: EChartsReactProps['option'] | undefined;
    isLoading: boolean;
    error: Error | null;
} & Partial<Pick<EChartsReactProps, 'style'>>;

const ChartView = memo<Props>(({ config, isLoading, error, style, spec }) => {
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
        <>
            <LoadingOverlay visible={isLoading} />

            {spec && (
                <EChartsReact
                    option={spec}
                    notMerge
                    opts={{ renderer: 'svg' }}
                    style={style}
                />
            )}
        </>
    );
});

export default ChartView;
