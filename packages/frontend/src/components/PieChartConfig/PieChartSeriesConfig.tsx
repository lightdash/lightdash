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
import { IconHash } from '@tabler/icons-react';
import React from 'react';
import { isHexCodeColor } from '../../utils/colorUtils';
import MantineIcon from '../common/MantineIcon';
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
                <Stack
                    spacing="xs"
                    bg="gray.1"
                    p="sm"
                    sx={(theme) => ({ borderRadius: theme.radius.sm })}
                >
                    {groupLabels.map((groupLabel) => {
                        const color =
                            groupColorOverrides[groupLabel] ??
                            groupColorDefaults[groupLabel];

                        const isInvalidHexColor = !isHexCodeColor(color);

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
                                            <Stack spacing="xs">
                                                <ColorPicker
                                                    size="md"
                                                    format="hex"
                                                    swatches={defaultColors}
                                                    swatchesPerRow={
                                                        defaultColors.length
                                                    }
                                                    value={color}
                                                    onChange={(newColor) => {
                                                        groupColorChange(
                                                            groupLabel,
                                                            newColor,
                                                        );
                                                    }}
                                                />

                                                <TextInput
                                                    icon={
                                                        <MantineIcon
                                                            icon={IconHash}
                                                        />
                                                    }
                                                    placeholder="Type in a custom HEX color"
                                                    error={
                                                        isInvalidHexColor
                                                            ? 'Invalid HEX color'
                                                            : null
                                                    }
                                                    value={(
                                                        groupColorOverrides[
                                                            groupLabel
                                                        ] ?? ''
                                                    ).replace('#', '')}
                                                    onChange={(event) => {
                                                        const newColor =
                                                            event.currentTarget
                                                                .value;

                                                        groupColorChange(
                                                            groupLabel,
                                                            newColor === ''
                                                                ? newColor
                                                                : `#${newColor}`,
                                                        );
                                                    }}
                                                />
                                            </Stack>
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
