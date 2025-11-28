import {
    TimeFrames,
    formatDate,
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
import { useCallback, useEffect, useRef, type FC } from 'react';
import useTracking from '../../../../providers/Tracking/useTracking';
import { EventName } from '../../../../types/Events';
import { useAppSelector } from '../../../sqlRunner/store/hooks';
import { useDateRangePicker } from '../../hooks/useDateRangePicker';
import { getMatchingPresetLabel } from '../../utils/metricExploreDate';
import { TimeDimensionIntervalPicker } from './TimeDimensionIntervalPicker';

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
    isFetching: boolean;
};

export const MetricExploreDatePicker: FC<Props> = ({
    dateRange,
    onChange,
    showTimeDimensionIntervalPicker,
    timeDimensionBaseField,
    timeInterval,
    onTimeIntervalChange,
    setTimeDimensionOverride,
    isFetching,
}) => {
    const { track } = useTracking();
    const userUuid = useAppSelector(
        (state) => state.metricsCatalog.user?.userUuid,
    );
    const organizationUuid = useAppSelector(
        (state) => state.metricsCatalog.organizationUuid,
    );
    const projectUuid = useAppSelector(
        (state) => state.metricsCatalog.projectUuid,
    );
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
    } = useDateRangePicker({
        value: dateRange,
        onChange,
        timeInterval,
    });

    const handleTrackDateFilterApplied = useCallback(() => {
        track({
            name: EventName.METRICS_CATALOG_EXPLORE_DATE_FILTER_APPLIED,
            properties: {
                organizationId: organizationUuid,
                projectId: projectUuid,
                userId: userUuid,
            },
        });
    }, [organizationUuid, projectUuid, track, userUuid]);

    const lastStableMatchingPresetLabel = useRef(
        getMatchingPresetLabel(dateRange, timeInterval),
    );

    useEffect(() => {
        if (!isFetching) {
            lastStableMatchingPresetLabel.current = getMatchingPresetLabel(
                dateRange,
                timeInterval,
            );
        }
    }, [dateRange, timeInterval, isFetching]);

    const effectiveMatchingPresetLabel = isFetching
        ? lastStableMatchingPresetLabel.current
        : getMatchingPresetLabel(dateRange, timeInterval);

    const customWithPresets = [
        {
            label: effectiveMatchingPresetLabel ? (
                'Custom'
            ) : (
                <UnstyledButton
                    onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                        e.stopPropagation();
                        handleOpen(true);
                    }}
                >
                    <Text size="sm" fw={500} c="ldDark.8">
                        Custom:{' '}
                        <Text size="sm" fw={500} c="ldGray.6" span>
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
        <Popover
            opened={isOpen}
            onChange={handleOpen}
            position="bottom-start"
            shadow="sm"
        >
            <Popover.Target>
                <Group position="apart" w="fill-available" noWrap>
                    <SegmentedControl
                        disabled={isFetching}
                        size="xs"
                        h={32}
                        data={customWithPresets}
                        value={
                            isOpen ||
                            !timeDimensionBaseField ||
                            !effectiveMatchingPresetLabel
                                ? 'custom'
                                : effectiveMatchingPresetLabel
                        }
                        onChange={(value) => {
                            if (isFetching) return;

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
                                    handleTrackDateFilterApplied();
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
                                border: `1px solid ${theme.colors.ldGray[2]}`,
                                borderRadius: theme.radius.md,
                                backgroundColor: theme.colors.ldGray[0],
                                alignItems: 'center',
                            },
                            label: {
                                fontSize: theme.fontSizes.sm,
                                color: theme.colors.ldGray[6],
                                fontWeight: 500,
                                paddingLeft: theme.spacing.sm,
                                paddingRight: theme.spacing.sm,
                                '&[data-active]': {
                                    color: theme.colors.ldDark[7],
                                },
                            },
                            control: {
                                '&:not(:first-of-type)': {
                                    borderLeft: 'none',
                                },
                            },
                            indicator: {
                                boxShadow: theme.shadows.subtle,
                                border: `1px solid ${theme.colors.ldGray[3]}`,
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
                                    color: theme.colors.ldGray[7],
                                    padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
                                    borderRadius: theme.radius.sm,
                                    backgroundColor:
                                        tempSelectedPreset?.label ===
                                        preset.label
                                            ? theme.colors.ldGray[0]
                                            : 'transparent',

                                    '&:hover': {
                                        backgroundColor: theme.colors.ldGray[0],
                                    },
                                })}
                            >
                                {preset.label}
                            </UnstyledButton>
                        ))}
                    </Stack>

                    <Divider orientation="vertical" color="ldGray.2" />
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
                        <Divider color="ldGray.2" />
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
                                                border: `1px solid ${theme.colors.ldGray[2]}`,
                                            },
                                        })}
                                    />
                                    <Text size="xs" c="ldGray.5">
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
                                                border: `1px solid ${theme.colors.ldGray[2]}`,
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
                                            border: `1px solid ${theme.colors.ldGray[2]}`,
                                        })}
                                    >
                                        Cancel
                                    </Button>
                                    <Button
                                        size="xs"
                                        radius="md"
                                        color="dark"
                                        onClick={() => {
                                            handleApply();

                                            handleTrackDateFilterApplied();
                                        }}
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
