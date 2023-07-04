import { PieChartValueLabel, PieChartValueLabels } from '@lightdash/common';
import {
    ColorPicker,
    ColorSwatch,
    Group,
    Input,
    Popover,
    Select,
    Stack,
    TextInput,
} from '@mantine/core';
import React from 'react';
import { useVisualizationContext } from '../LightdashVisualization/VisualizationProvider';

const PieChartSeriesConfig: React.FC = () => {
    const {
        pieChartConfig: {
            defaultColors,
            valueLabel,
            valueLabelChange,
            groupLabels,
            groupLabelOverrides,
            groupLabelChange,
            groupColorOverrides,
            groupColorDefaults,
            groupColorChange,
        },
    } = useVisualizationContext();

    return (
        <Stack>
            <Select
                label="Value labels"
                value={valueLabel}
                data={Object.entries(PieChartValueLabels).map(
                    ([value, label]) => ({
                        value,
                        label,
                    }),
                )}
                onChange={(newValueLabel: PieChartValueLabel) => {
                    valueLabelChange(newValueLabel);
                }}
            />

            {groupLabels.length === 0 ? null : (
                <Stack spacing="xs" bg="gray.1" p="sm">
                    {groupLabels.map((groupLabel) => {
                        const color =
                            groupColorOverrides[groupLabel] ??
                            groupColorDefaults[groupLabel];

                        return (
                            <Group key={groupLabel} spacing="xs">
                                <Input.Wrapper>
                                    <Popover shadow="md" withArrow>
                                        <Popover.Target>
                                            <ColorSwatch
                                                key={groupLabel}
                                                color={color}
                                            />
                                        </Popover.Target>
                                        <Popover.Dropdown p="xs">
                                            <ColorPicker
                                                w="9xl"
                                                format="hex"
                                                swatches={defaultColors}
                                                swatchesPerRow={
                                                    defaultColors.length
                                                }
                                                value={color}
                                                onChangeEnd={(newColor) => {
                                                    groupColorChange(
                                                        groupLabel,
                                                        newColor,
                                                    );
                                                }}
                                            />
                                        </Popover.Dropdown>
                                    </Popover>
                                </Input.Wrapper>

                                <TextInput
                                    sx={{ flexGrow: 1 }}
                                    placeholder={groupLabel}
                                    value={
                                        groupLabelOverrides[groupLabel] ?? ''
                                    }
                                    onChange={(event) => {
                                        groupLabelChange(
                                            groupLabel,
                                            event.currentTarget.value,
                                        );
                                    }}
                                />
                            </Group>
                        );
                    })}
                </Stack>
            )}
        </Stack>
    );
};

export default PieChartSeriesConfig;
