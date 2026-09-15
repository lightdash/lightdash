import {
    formatDate,
    TimeFrames,
    type MetricExplorerDateRange,
    type TimeDimensionConfig,
} from '@lightdash/common';
import {
    TextInput,
    Box,
    Divider,
    Group,
    Stack,
    Text,
    UnstyledButton,
    Button,
    SegmentedControl,
    Popover,
    Tooltip,
    useMatches,
} from '@mantine/core';
import { useCallback, useEffect, useRef, type FC } from 'react';
import CalendarRangePicker from '../../../../components/common/DatePickers/CalendarRangePicker';
import MonthRangePicker from '../../../../components/common/DatePickers/MonthRangePicker';
import YearRangePicker from '../../../../components/common/DatePickers/YearRangePicker';
import { useUiStrings } from '../../../../ee/providers/Embed/useUiStrings';
import useTracking from '../../../../providers/Tracking/useTracking';
import { EventName } from '../../../../types/Events';
import { useAppSelector } from '../../../sqlRunner/store/hooks';
import { useDateRangePicker } from '../../hooks/useDateRangePicker';
import { getMatchingPresetLabel } from '../../utils/metricExploreDate';
import styles from './MetricExploreDatePicker.module.css';
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
    disabled?: boolean;
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
    disabled = false,
}) => {
    const compact = useMatches({ base: true, sm: false });
    const getUiString = useUiStrings();
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
                        <Text size="sm" fw={500} c="dimmed" span>
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
            floatingStrategy="fixed"
            middlewares={{ shift: { crossAxis: true, padding: 12 } }}
            width={compact ? 'calc(100vw - 24px)' : undefined}
        >
            <Popover.Target>
                <Group
                    justify="space-between"
                    w="100%"
                    className={styles.toolbar}
                >
                    {compact ? (
                        <Button
                            variant="default"
                            size="xs"
                            className={styles.rangeButton}
                            disabled={isFetching || disabled}
                            onClick={() => handleOpen(!isOpen)}
                            aria-expanded={isOpen}
                        >
                            {effectiveMatchingPresetLabel || buttonLabel}
                        </Button>
                    ) : (
                        <SegmentedControl
                            disabled={isFetching || disabled}
                            size="xs"
                            h={32}
                            data={customWithPresets}
                            value={
                                isOpen ||
                                !timeDimensionBaseField ||
                                !effectiveMatchingPresetLabel ||
                                !presets.some(
                                    (p) =>
                                        p.controlLabel ===
                                        effectiveMatchingPresetLabel,
                                )
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
                            withItemsBorders={false}
                            classNames={{
                                root: styles.root,
                                label: styles.label,
                                indicator: styles.indicator,
                            }}
                        />
                    )}
                    {showTimeDimensionIntervalPicker &&
                        timeDimensionBaseField && (
                            <Tooltip label="Change granularity" position="top">
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

            <Popover.Dropdown p={0} className={styles.dropdown}>
                <Group gap={0} align="flex-start" className={styles.datePanel}>
                    <Stack gap={2} py="xs" px="sm" className={styles.presets}>
                        {presets.map((preset) => (
                            <UnstyledButton
                                key={preset.label}
                                onClick={() => handlePresetSelect(preset)}
                                data-selected={
                                    tempSelectedPreset?.label ===
                                        preset.label || undefined
                                }
                                className={styles.presetButton}
                            >
                                {preset.label}
                            </UnstyledButton>
                        ))}
                    </Stack>

                    <Divider orientation="vertical" color="ldGray.2" />
                    <Stack gap={0} className={styles.calendar}>
                        <Box px="xs">
                            {calendarConfig?.type === TimeFrames.YEAR ? (
                                <YearRangePicker
                                    {...calendarConfig.props}
                                    numberOfColumns={compact ? 1 : 2}
                                    mih={180}
                                    w="100%"
                                    size="xs"
                                />
                            ) : calendarConfig?.type === TimeFrames.MONTH ? (
                                <MonthRangePicker
                                    {...calendarConfig.props}
                                    numberOfColumns={compact ? 1 : 2}
                                    mih={180}
                                    size="xs"
                                />
                            ) : calendarConfig ? (
                                <CalendarRangePicker
                                    {...calendarConfig.props}
                                    numberOfColumns={compact ? 1 : 2}
                                    mih={225}
                                    size="xs"
                                    withCellSpacing={false}
                                />
                            ) : null}
                        </Box>
                        <Divider color="ldGray.2" />
                        <Box p="sm" className={styles.footer}>
                            <Group justify="space-between" gap="xl">
                                <Group gap="xs">
                                    <TextInput
                                        aria-label={getUiString(
                                            'metrics.dateStart',
                                        )}
                                        size="xs"
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
                                        aria-label={getUiString(
                                            'metrics.dateEnd',
                                        )}
                                        size="xs"
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

                                <Group gap="xs">
                                    <Button
                                        size="xs"
                                        variant="default"
                                        onClick={() => handleOpen(false)}
                                        style={(theme) => ({
                                            boxShadow: theme.shadows.subtle,
                                            border: `1px solid ${theme.colors.ldGray[2]}`,
                                        })}
                                    >
                                        Cancel
                                    </Button>
                                    <Button
                                        size="xs"
                                        onClick={() => {
                                            handleApply();

                                            handleTrackDateFilterApplied();
                                        }}
                                        style={(theme) => ({
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
