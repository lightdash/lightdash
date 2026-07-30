import {
    isVizBigNumberConfig,
    type AnyType,
    type VizBigNumberConfig,
    type VizCartesianChartConfig,
    type VizPieChartConfig,
} from '@lightdash/common';
import { Box } from '@mantine-8/core';
import { type SerializedError } from '@reduxjs/toolkit';
import { type FC } from 'react';
import BigNumberView from '../../../components/DataViz/visualizations/BigNumberView';
import ChartView from '../../../components/DataViz/visualizations/ChartView';
import type { EChartsInstance } from '../../../components/EChartsReactWrapper';

type Props = {
    config: VizCartesianChartConfig | VizPieChartConfig | VizBigNumberConfig;
    spec: Record<string, AnyType> | undefined;
    isLoading: boolean;
    error: SerializedError | null | undefined;
    height: number;
    width: number;
    onEchartsReady: (instance: EChartsInstance) => void;
};

/**
 * Renders whichever non-table visualization a SQL chart config asks for. Big
 * numbers are plain React; everything else goes through ECharts.
 */
export const SqlRunnerChart: FC<Props> = ({
    config,
    spec,
    isLoading,
    error,
    height,
    width,
    onEchartsReady,
}) => {
    if (isVizBigNumberConfig(config)) {
        return (
            <Box h={height}>
                <BigNumberView
                    spec={spec}
                    isLoading={isLoading}
                    error={error}
                    hasValueField={!!config.fieldConfig?.y?.length}
                />
            </Box>
        );
    }

    return (
        <ChartView
            config={config}
            spec={spec}
            isLoading={isLoading}
            error={error}
            style={{ height, flex: width }}
            onChartReady={onEchartsReady}
        />
    );
};
