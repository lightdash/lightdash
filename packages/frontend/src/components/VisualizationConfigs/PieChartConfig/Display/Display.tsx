import {
    PieChartLegendPositions,
    type PieChartLegendPosition,
} from '@lightdash/common';
import {
    Collapse,
    Group,
    SegmentedControl,
    Stack,
    Switch,
} from '@mantine/core';
import React from 'react';
import { isPieVisualizationConfig } from '../../../LightdashVisualization/VisualizationConfigPie';
import { useVisualizationContext } from '../../../LightdashVisualization/VisualizationProvider';
import { Config } from '../../common/Config';

export const Display: React.FC = () => {
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
            <Config>
                <Group>
                    <Config.Label>Show legend</Config.Label>
                    <Switch checked={showLegend} onChange={toggleShowLegend} />
                </Group>
            </Config>

            <Collapse in={showLegend}>
                <Group spacing="xs">
                    <Config.SubLabel>Orientation</Config.SubLabel>
                    <SegmentedControl
                        name="orient"
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
                </Group>
            </Collapse>
        </Stack>
    );
};
