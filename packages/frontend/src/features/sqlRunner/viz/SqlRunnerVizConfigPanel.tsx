import { Stack } from '@mantine/core';
import { type FC } from 'react';
import VisualizationConfig from '../../../components/Explorer/VisualizationCard/VisualizationConfig';
import { useVisualizationContext } from '../../../components/LightdashVisualization/useVisualizationContext';
import { SqlRunnerChartTypePicker } from './SqlRunnerChartTypePicker';

/** The sidebar's Chart tab: the chart type and the explorer's own config panel for it. */
export const SqlRunnerVizConfigPanel: FC = () => {
    const { chartConfig } = useVisualizationContext();
    return (
        <Stack gap="sm">
            <SqlRunnerChartTypePicker />
            <VisualizationConfig chartType={chartConfig.type} />
        </Stack>
    );
};
