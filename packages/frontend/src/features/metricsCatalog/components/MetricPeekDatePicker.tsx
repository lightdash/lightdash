import {
    type ApiGetMetricPeek,
    type MetricExplorerDateRange,
} from '@lightdash/common';
import {
    Box,
    Button,
    Divider,
    Group,
    Popover,
    Stack,
    Text,
    TextInput,
    Tooltip,
    UnstyledButton,
} from '@mantine/core';
import { DatePicker } from '@mantine/dates';
import { IconCalendar, IconChevronDown } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { useDateRangePicker } from '../hooks/useDateRangePicker';

type Props = {
    defaultTimeDimension:
        | ApiGetMetricPeek['results']['defaultTimeDimension']
        | undefined;
    onChange: (dateRange: MetricExplorerDateRange) => void;
};

export const MetricPeekDatePicker: FC<Props> = ({
    defaultTimeDimension,
    onChange,
}) => {
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
    } = useDateRangePicker({ defaultTimeDimension, onChange });

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
                        size="sm"
                        px="xs"
                        w="100%"
                        styles={(theme) => ({
                            root: {
                                border: `1px solid ${theme.colors.gray[2]}`,
                            },
                            label: {
                                width: '100%',
                                fontWeight: 500,
                            },
                        })}
                    >
                        <Group position="apart" w="fill-available">
                            <Group spacing="xs">
                                <MantineIcon
                                    color="dark.3"
                                    icon={IconCalendar}
                                />
                                {buttonLabel}
                            </Group>
                            <MantineIcon
                                color="dark.3"
                                icon={IconChevronDown}
                            />
                        </Group>
                    </Button>
                </Tooltip>
            </Popover.Target>

            <Popover.Dropdown p={0}>
                <Group spacing={0} align="flex-start">
                    <Stack spacing={2} py="xs" px="sm">
                        {presets.map((preset) => (
                            <UnstyledButton
                                key={preset.label}
                                onClick={() => handlePresetSelect(preset)}
                                sx={(theme) => ({
                                    fontWeight: 500,
                                    fontSize: theme.fontSizes.xs,
                                    color: theme.colors.gray[7],
                                    padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
                                    borderRadius: theme.radius.sm,
                                    backgroundColor:
                                        tempSelectedPreset?.label ===
                                        preset.label
                                            ? theme.colors.gray[0]
                                            : 'transparent',

                                    '&:hover': {
                                        backgroundColor: theme.colors.gray[0],
                                    },
                                })}
                            >
                                {preset.label}
                            </UnstyledButton>
                        ))}
                    </Stack>

                    <Divider orientation="vertical" color="gray.2" />
                    <Stack spacing={0}>
                        <Box px="xs">
                            <DatePicker
                                mih={225}
                                type="range"
                                value={tempDateRange}
                                onChange={handleDateRangeChange}
                                numberOfColumns={2}
                                color="dark"
                                size="xs"
                                withCellSpacing={false}
                                styles={(theme) => ({
                                    yearLevel: {
                                        color: theme.colors.gray[7],
                                        padding: theme.spacing.xs,
                                    },
                                    decadeLevel: {
                                        color: theme.colors.gray[7],
                                        padding: theme.spacing.xs,
                                    },
                                    calendarHeaderControlIcon: {
                                        color: theme.colors.gray[5],
                                    },
                                    calendarHeaderLevel: {
                                        color: theme.colors.gray[7],
                                    },
                                    monthLevel: {
                                        padding: theme.spacing.xs,
                                        '&[data-month-level]:not(:last-of-type)':
                                            {
                                                borderRight: `1px solid ${theme.colors.gray[2]}`,
                                                marginRight: 0,
                                            },
                                    },
                                    day: {
                                        borderRadius: theme.radius.lg,
                                        // Revert color for weekends that are not selected
                                        '&[data-weekend="true"]&:not([data-selected])':
                                            {
                                                color: theme.colors.gray[7],
                                            },
                                        '&[data-in-range]': {
                                            backgroundColor:
                                                theme.colors.gray[1],
                                        },
                                        '&[data-in-range]:hover': {
                                            backgroundColor:
                                                theme.colors.gray[1],
                                        },
                                        '&[data-selected]': {
                                            backgroundColor:
                                                theme.colors.dark[7],
                                            borderRadius: theme.radius.lg,
                                        },
                                        '&[data-selected]:hover': {
                                            backgroundColor:
                                                theme.colors.dark[9],
                                            borderRadius: theme.radius.lg,
                                        },
                                    },
                                })}
                            />
                        </Box>
                        <Divider color="gray.2" />
                        <Box p="sm">
                            <Group position="apart" spacing="xl">
                                <Group spacing="xs">
                                    <TextInput
                                        size="xs"
                                        radius="md"
                                        w={100}
                                        value={formattedTempDateRange[0]}
                                        readOnly
                                        disabled={!formattedTempDateRange[0]}
                                        styles={(theme) => ({
                                            input: {
                                                boxShadow: theme.shadows.subtle,
                                                border: `1px solid ${theme.colors.gray[2]}`,
                                            },
                                        })}
                                    />
                                    <Text size="xs" c="gray.5">
                                        -
                                    </Text>
                                    <TextInput
                                        size="xs"
                                        radius="md"
                                        w={100}
                                        value={formattedTempDateRange[1]}
                                        readOnly
                                        disabled={!formattedTempDateRange[1]}
                                        styles={(theme) => ({
                                            input: {
                                                boxShadow: theme.shadows.subtle,
                                                border: `1px solid ${theme.colors.gray[2]}`,
                                            },
                                        })}
                                    />
                                </Group>

                                <Group spacing="xs">
                                    <Button
                                        size="xs"
                                        radius="md"
                                        variant="default"
                                        onClick={() => handleOpen(false)}
                                        sx={(theme) => ({
                                            boxShadow: theme.shadows.subtle,
                                            border: `1px solid ${theme.colors.gray[2]}`,
                                        })}
                                    >
                                        Cancel
                                    </Button>
                                    <Button
                                        size="xs"
                                        radius="md"
                                        color="dark"
                                        onClick={handleApply}
                                        sx={(theme) => ({
                                            boxShadow: theme.shadows.subtle,
                                        })}
                                    >
                                        Apply
                                    </Button>
                                </Group>
                            </Group>
                        </Box>
                    </Stack>
                </Group>
            </Popover.Dropdown>
        </Popover>
    );
};
