import {
    formatDate,
    TimeFrames,
    type MetricExplorerDateRange,
    type TimeDimensionConfig,
} from '@lightdash/common';
import {
    Box,
    Button,
    Divider,
    Group,
    Popover,
    SegmentedControl,
    Stack,
    Text,
    TextInput,
    Tooltip,
    UnstyledButton,
} from '@mantine/core';
import { DatePicker, MonthPicker, YearPicker } from '@mantine/dates';
import { type FC } from 'react';
import { useDateRangePicker } from '../hooks/useDateRangePicker';
import { getMatchingPresetLabel } from '../utils/metricPeekDate';
import { TimeDimensionIntervalPicker } from './visualization/TimeDimensionIntervalPicker';

type Props = {
    dateRange: MetricExplorerDateRange;
    onChange: (dateRange: MetricExplorerDateRange) => void;
    showTimeDimensionIntervalPicker: boolean;
    timeDimensionBaseField: TimeDimensionConfig | undefined;
    setTimeDimensionOverride: (
        timeDimensionOverride: TimeDimensionConfig | undefined,
    ) => void;
    timeInterval: TimeFrames;
    onTimeIntervalChange: (timeInterval: TimeFrames) => void;
};

export const MetricPeekDatePicker: FC<Props> = ({
    dateRange,
    onChange,
    showTimeDimensionIntervalPicker,
    timeDimensionBaseField,
    timeInterval,
    onTimeIntervalChange,
    setTimeDimensionOverride,
}) => {
    const {
        isOpen,
        tempSelectedPreset,
        presets,
        buttonLabel,
        formattedTempDateRange,
        handleOpen,
        handleApply,
        handlePresetSelect,
        reset,
        calendarConfig,
    } = useDateRangePicker({ value: dateRange, onChange, timeInterval });

    const matchingPresetLabel = getMatchingPresetLabel(dateRange, timeInterval);

    const customWithPresets = [
        {
            label: matchingPresetLabel ? (
                'Custom'
            ) : (
                <UnstyledButton
                    onClick={(e) => {
                        e.stopPropagation();
                        handleOpen(true);
                    }}
                >
                    <Text size="sm" fw={500} c="dark.8">
                        Custom:{' '}
                        <Text size="sm" fw={500} c="gray.6" span>
                            {buttonLabel}
                        </Text>
                    </Text>
                </UnstyledButton>
            ),
            value: 'custom',
        },
        ...presets.map((preset) => ({
            label: (
                <Tooltip
                    variant="xs"
                    label={`${formatDate(preset.getValue()[0])} to ${formatDate(
                        preset.getValue()[1],
                    )}`}
                >
                    <Box>{preset.controlLabel}</Box>
                </Tooltip>
            ),
            value: preset.controlLabel,
        })),
    ];

    return (
        <Popover opened={isOpen} onChange={handleOpen} position="bottom-start">
            <Popover.Target>
                <Group position="apart" w="fill-available" noWrap>
                    <SegmentedControl
                        size="xs"
                        h={32}
                        data={customWithPresets}
                        value={
                            isOpen ||
                            !timeDimensionBaseField ||
                            !matchingPresetLabel
                                ? 'custom'
                                : matchingPresetLabel
                        }
                        onChange={(value) => {
                            if (value === 'custom') {
                                handleOpen(true);
                            } else {
                                handleOpen(false);
                                const presetDateRange = presets
                                    .find(
                                        (preset) =>
                                            preset.controlLabel === value,
                                    )
                                    ?.getValue();
                                if (presetDateRange) {
                                    onChange(
                                        presetDateRange as MetricExplorerDateRange,
                                    );
                                }
                            }
                        }}
                        transitionDuration={300}
                        transitionTimingFunction="linear"
                        styles={(theme) => ({
                            root: {
                                border: `1px solid ${theme.colors.gray[2]}`,
                                borderRadius: theme.radius.md,
                                backgroundColor: theme.colors.gray[0],
                                alignItems: 'center',
                            },
                            label: {
                                fontSize: theme.fontSizes.sm,
                                color: theme.colors.gray[6],
                                fontWeight: 500,
                                paddingLeft: theme.spacing.sm,
                                paddingRight: theme.spacing.sm,
                                '&[data-active]': {
                                    color: theme.colors.dark[7],
                                },
                            },
                            control: {
                                '&:not(:first-of-type)': {
                                    borderLeft: 'none',
                                },
                            },
                            indicator: {
                                boxShadow: theme.shadows.subtle,
                                border: `1px solid ${theme.colors.gray[3]}`,
                                borderRadius: theme.radius.md,
                                top: 4,
                            },
                        })}
                    />
                    {showTimeDimensionIntervalPicker &&
                        timeDimensionBaseField && (
                            <Tooltip
                                variant="xs"
                                label="Change granularity"
                                position="top"
                                withinPortal
                            >
                                <Box>
                                    <TimeDimensionIntervalPicker
                                        dimension={timeDimensionBaseField}
                                        onChange={(value) => {
                                            setTimeDimensionOverride(value);
                                            onTimeIntervalChange(
                                                value?.interval ?? timeInterval,
                                            );
                                            reset();
                                        }}
                                    />
                                </Box>
                            </Tooltip>
                        )}
                </Group>
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
                            {calendarConfig?.type === TimeFrames.YEAR ? (
                                <YearPicker
                                    {...calendarConfig.props}
                                    mih={180}
                                    w="100%"
                                    color="dark"
                                    size="xs"
                                />
                            ) : calendarConfig?.type === TimeFrames.MONTH ? (
                                <MonthPicker
                                    {...calendarConfig.props}
                                    mih={180}
                                    color="dark"
                                    size="xs"
                                />
                            ) : (
                                <DatePicker
                                    {...calendarConfig?.props}
                                    mih={225}
                                    color="dark"
                                    size="xs"
                                    withCellSpacing={false}
                                />
                            )}
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
