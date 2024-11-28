import { type ApiGetMetricPeek } from '@lightdash/common';
import {
    Button,
    Group,
    Popover,
    Stack,
    TextInput,
    Tooltip,
} from '@mantine/core';
import { DatePicker } from '@mantine/dates';
import { IconCalendar } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { useDateRangePicker } from '../hooks/useDateRangePicker';

type Props = {
    defaultTimeDimension:
        | ApiGetMetricPeek['results']['defaultTimeDimension']
        | undefined;
};

export const MetricPeekDatePicker: FC<Props> = ({ defaultTimeDimension }) => {
    const {
        isOpen,
        tempDateRange,
        selectedPreset,
        tempSelectedPreset,
        presets,
        buttonLabel,
        formattedTempDateRange,
        handleOpen,
        handleApply,
        handlePresetSelect,
        handleDateRangeChange,
    } = useDateRangePicker({ defaultTimeDimension });

    return (
        <Popover opened={isOpen} onChange={handleOpen} position="bottom-start">
            <Popover.Target>
                <Tooltip
                    label={
                        selectedPreset?.getTooltipLabel() ?? 'Select date range'
                    }
                >
                    <Button
                        variant="default"
                        radius="md"
                        onClick={() => handleOpen(!isOpen)}
                        size="xs"
                        leftIcon={<MantineIcon icon={IconCalendar} />}
                        sx={(theme) => ({
                            border: `1px solid ${theme.colors.gray[2]}`,
                        })}
                    >
                        {buttonLabel}
                    </Button>
                </Tooltip>
            </Popover.Target>

            <Popover.Dropdown p="xs">
                <Group spacing="sm" align="flex-start">
                    <Stack spacing="xs">
                        {presets.map((preset) => (
                            <Button
                                key={preset.label}
                                variant={
                                    tempSelectedPreset?.label === preset.label
                                        ? 'filled'
                                        : 'subtle'
                                }
                                color="dark"
                                size="xs"
                                onClick={() => handlePresetSelect(preset)}
                                fullWidth
                            >
                                {preset.label}
                            </Button>
                        ))}
                    </Stack>

                    <Stack>
                        <DatePicker
                            type="range"
                            value={tempDateRange}
                            onChange={handleDateRangeChange}
                            numberOfColumns={2}
                            color="dark"
                            size="xs"
                            styles={(theme) => ({
                                day: {
                                    '&[data-in-range]': {
                                        backgroundColor: theme.colors.gray[2],
                                    },
                                    '&[data-in-range]:hover': {
                                        backgroundColor: theme.colors.gray[4],
                                    },
                                    '&[data-selected]': {
                                        backgroundColor: theme.colors.dark[7],
                                    },
                                    '&[data-selected]:hover': {
                                        backgroundColor: theme.colors.dark[9],
                                    },
                                },
                            })}
                        />
                        <Group position="apart" spacing="xl">
                            <Group spacing="xs">
                                <TextInput
                                    size="xs"
                                    radius="md"
                                    w={100}
                                    value={formattedTempDateRange[0]}
                                    readOnly
                                    disabled={!formattedTempDateRange[0]}
                                />
                                -
                                <TextInput
                                    size="xs"
                                    radius="md"
                                    w={100}
                                    value={formattedTempDateRange[1]}
                                    readOnly
                                    disabled={!formattedTempDateRange[1]}
                                />
                            </Group>

                            <Group spacing="xs">
                                <Button
                                    size="xs"
                                    radius="md"
                                    variant="default"
                                    onClick={() => handleOpen(false)}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    size="xs"
                                    radius="md"
                                    color="dark"
                                    onClick={handleApply}
                                >
                                    Apply
                                </Button>
                            </Group>
                        </Group>
                    </Stack>
                </Group>
            </Popover.Dropdown>
        </Popover>
    );
};
