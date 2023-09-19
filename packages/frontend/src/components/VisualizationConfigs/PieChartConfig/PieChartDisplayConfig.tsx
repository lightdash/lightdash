import React from 'react';
import { useVisualizationContext } from '../../LightdashVisualization/VisualizationProvider';
import {
    Collapse,
    SegmentedControl,
    Stack,
    Switch,
    Text,
} from '@mantine/core';

const PieChartDisplayConfig: React.FC = () => {
    const {
        pieChartConfig: { validPieChartConfig, showLegend, toggleShowLegend },
    } = useVisualizationContext();

    const handleChange = (
        newValue: string,
    ) => {
        const { setOrientLegend } = validPieChartConfig;
        setOrientLegend(newValue);
    };

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
                    value={validPieChartConfig.orientLegend ?? 'horizontal'}
                    onChange={(val) => handleChange(val)}
                    data={[
                        { label: 'Horizontal', value: 'horizontal' },
                        { label: 'Vertical', value: 'vertical' },
                    ]}
                />
            </Collapse>
        </Stack>
    );
};

export default PieChartDisplayConfig;
