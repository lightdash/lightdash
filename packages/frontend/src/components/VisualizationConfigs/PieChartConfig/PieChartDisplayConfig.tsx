import {
    PieChartLegendPosition,
    PieChartLegendPositions,
} from '@lightdash/common';
import { Collapse, SegmentedControl, Stack, Switch, Text } from '@mantine/core';
import React from 'react';
import { useVisualizationContext } from '../../LightdashVisualization/VisualizationProvider';

const PieChartDisplayConfig: React.FC = () => {
    const {
        pieChartConfig: {
            showLegend,
            toggleShowLegend,
            legendPosition,
            legendPositionChange,
        },
    } = useVisualizationContext();

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
