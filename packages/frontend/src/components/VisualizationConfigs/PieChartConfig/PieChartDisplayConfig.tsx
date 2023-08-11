import { Stack, Switch } from '@mantine/core';
import React from 'react';
import { useVisualizationContext } from '../../LightdashVisualization/VisualizationProvider';

const PieChartDisplayConfig: React.FC = () => {
    const {
        pieChartConfig: { showLegend, toggleShowLegend },
    } = useVisualizationContext();

    return (
        <Stack>
            <Switch
                label="Show legend"
                checked={showLegend}
                onChange={toggleShowLegend}
            />
        </Stack>
    );
};

export default PieChartDisplayConfig;
