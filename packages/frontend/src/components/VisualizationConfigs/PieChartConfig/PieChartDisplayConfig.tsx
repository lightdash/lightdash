import {
    PieChartLegendLabelMaxLengthDefault,
    PieChartLegendPositions,
    type PieChartLegendPosition,
} from '@lightdash/common';
import {
    Collapse,
    Group,
    SegmentedControl,
    Stack,
    Switch,
    TextInput,
} from '@mantine-8/core';
import React from 'react';
import { isPieVisualizationConfig } from '../../LightdashVisualization/types';
import { useVisualizationContext } from '../../LightdashVisualization/useVisualizationContext';
import { Config } from '../common/Config';

export const Display: React.FC = () => {
    const { visualizationConfig } = useVisualizationContext();

    if (!isPieVisualizationConfig(visualizationConfig)) return null;

    const {
        showLegend,
        toggleShowLegend,
        legendPosition,
        legendPositionChange,
        legendMaxItemLength,
        legendMaxItemLengthChange,
    } = visualizationConfig.chartConfig;

    return (
        <Stack>
            <Config>
                <Group>
                    <Config.Heading>Show legend</Config.Heading>
                    <Switch checked={showLegend} onChange={toggleShowLegend} />
                </Group>
            </Config>

            <Collapse in={showLegend}>
                <Stack gap="xs">
                    <Group gap="xs">
                        <Config.Label>Orientation</Config.Label>
                        <SegmentedControl
                            name="orient"
                            value={legendPosition}
                            onChange={(val: string) =>
                                legendPositionChange(
                                    val as PieChartLegendPosition,
                                )
                            }
                            data={Object.entries(PieChartLegendPositions).map(
                                ([position, label]) => ({
                                    label,
                                    value: position,
                                }),
                            )}
                        />
                    </Group>
                    <Group>
                        <Config.Label>Label max length</Config.Label>
                        <TextInput
                            type="number"
                            value={legendMaxItemLength}
                            placeholder={PieChartLegendLabelMaxLengthDefault.toString()}
                            onChange={(e) => {
                                const parsedNumber = Number.parseInt(
                                    e.target.value,
                                    10,
                                );
                                legendMaxItemLengthChange(
                                    !Number.isNaN(parsedNumber)
                                        ? parsedNumber
                                        : undefined,
                                );
                            }}
                        />
                    </Group>
                </Stack>
            </Collapse>
        </Stack>
    );
};
