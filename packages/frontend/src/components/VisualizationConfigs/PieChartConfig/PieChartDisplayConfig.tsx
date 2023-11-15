import {
    PieChartLegendPosition,
    PieChartLegendPositions,
} from '@lightdash/common';
import { Collapse, SegmentedControl, Stack, Switch, Text } from '@mantine/core';
import React from 'react';
import { isPieVisualizationConfig } from '../../LightdashVisualization/VisualizationConfigPie';
import { useVisualizationContext } from '../../LightdashVisualization/VisualizationProvider';

const PieChartDisplayConfig: React.FC = () => {
    const { visualizationConfig } = useVisualizationContext();

    if (!isPieVisualizationConfig(visualizationConfig)) return null;

    const {
        showLegend,
        toggleShowLegend,
        legendPosition,
        legendPositionChange,
    } = visualizationConfig.chartConfig;

    return (
        <Stack>
            <Switch
                label="Show legend"
                checked={showLegend}
                onChange={toggleShowLegend}
            />

            <Collapse in={showLegend}>
                <Text fw={600}>Orientation</Text>
                <SegmentedControl
                    name="orient"
                    color="blue"
                    size="sm"
                    fullWidth
                    value={legendPosition}
                    onChange={(val: PieChartLegendPosition) =>
                        legendPositionChange(val)
                    }
                    data={Object.entries(PieChartLegendPositions).map(
                        ([position, label]) => ({
                            label,
                            value: position,
                        }),
                    )}
                />
            </Collapse>
        </Stack>
    );
};

export default PieChartDisplayConfig;
