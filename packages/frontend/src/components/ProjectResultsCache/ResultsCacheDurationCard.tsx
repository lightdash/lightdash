import {
    MAX_RESULTS_CACHE_TTL_SECONDS,
    MIN_RESULTS_CACHE_TTL_SECONDS,
    type ResultsCacheClearSchedule,
    type ResultsCacheStatsDays,
} from '@lightdash/common';
import {
    Box,
    Button,
    Divider,
    Group,
    SegmentedControl,
    Stack,
    Text,
    Title,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { type FC, type FormEvent } from 'react';
import {
    useUpdateResultsCacheClearSchedule,
    useUpdateResultsCacheSettings,
} from '../../hooks/useProjectResultsCacheSettings';
import { NumberInput } from '../common/NumberInput';
import { SettingsCard } from '../common/Settings/SettingsCard';
import {
    isClearScheduleValid,
    toClearScheduleUpdate,
    useClearScheduleForm,
} from './clearScheduleForm';
import { formatCacheEventTime } from './formatCacheEventTime';
import { ResultsCacheClearScheduleFields } from './ResultsCacheClearScheduleFields';
import { ResultsCacheTtlProjectionHint } from './ResultsCacheTtlProjectionHint';

const MIN_TTL_MINUTES = MIN_RESULTS_CACHE_TTL_SECONDS / 60;
const MAX_TTL_MINUTES = MAX_RESULTS_CACHE_TTL_SECONDS / 60;

const MINUTES_PER_HOUR = 60;
const MINUTES_PER_DAY = 24 * MINUTES_PER_HOUR;

const plural = (value: number, unit: string) =>
    `${value} ${unit}${value === 1 ? '' : 's'}`;

const formatDuration = (minutes: number): string => {
    if (minutes >= 2 * MINUTES_PER_DAY && minutes % MINUTES_PER_DAY === 0) {
        return plural(minutes / MINUTES_PER_DAY, 'day');
    }
    if (minutes >= MINUTES_PER_HOUR) {
        const hours = minutes / MINUTES_PER_HOUR;
        return plural(
            Number.isInteger(hours) ? hours : Number(hours.toFixed(1)),
            'hour',
        );
    }
    return plural(minutes, 'minute');
};

const formatDurationHint = (minutes: number | ''): string | null =>
    typeof minutes === 'number' && minutes >= MINUTES_PER_HOUR
        ? `= ${formatDuration(minutes)}`
        : null;

type DurationMode = 'instanceDefault' | 'custom';

const DURATION_MODE_OPTIONS: { value: DurationMode; label: string }[] = [
    { value: 'instanceDefault', label: 'Instance default' },
    { value: 'custom', label: 'Custom duration' },
];

type DurationFormValues = {
    mode: DurationMode;
    ttlMinutes: number | '';
};

type Props = {
    projectUuid: string;
    days: ResultsCacheStatsDays;
    initialTtlSeconds: number | null;
    instanceDefaultSeconds: number;
    clearSchedule: ResultsCacheClearSchedule | null;
    schedulerTimezone: string;
    showDuration: boolean;
    showProjections: boolean;
    showSchedule: boolean;
};

export const ResultsCacheDurationCard: FC<Props> = ({
    projectUuid,
    days,
    initialTtlSeconds,
    instanceDefaultSeconds,
    clearSchedule,
    schedulerTimezone,
    showDuration,
    showProjections,
    showSchedule,
}) => {
    const { mutate: updateSettings, isLoading: isUpdatingDuration } =
        useUpdateResultsCacheSettings(projectUuid);
    const { mutate: updateSchedule, isLoading: isUpdatingSchedule } =
        useUpdateResultsCacheClearSchedule(projectUuid);
    const isSaving = isUpdatingDuration || isUpdatingSchedule;
    const instanceDefaultMinutes = Math.round(instanceDefaultSeconds / 60);

    const durationForm = useForm<DurationFormValues>({
        initialValues: {
            mode: initialTtlSeconds === null ? 'instanceDefault' : 'custom',
            ttlMinutes:
                initialTtlSeconds === null
                    ? instanceDefaultMinutes
                    : Math.round(initialTtlSeconds / 60),
        },
        validateInputOnChange: true,
        validate: {
            ttlMinutes: (value, values) => {
                if (values.mode === 'instanceDefault') return null;
                if (
                    typeof value !== 'number' ||
                    !Number.isInteger(value) ||
                    value < MIN_TTL_MINUTES ||
                    value > MAX_TTL_MINUTES
                ) {
                    return `Enter a whole number of minutes between ${MIN_TTL_MINUTES} and ${MAX_TTL_MINUTES} (30 days)`;
                }
                return null;
            },
        },
    });
    const scheduleForm = useClearScheduleForm(clearSchedule);

    const isCustom = durationForm.values.mode === 'custom';
    const isDurationDirty =
        showDuration &&
        (durationForm.isDirty('mode') ||
            (isCustom && durationForm.isDirty('ttlMinutes')));
    const isScheduleDirty = showSchedule && scheduleForm.isDirty();
    const canSave =
        (isDurationDirty || isScheduleDirty) &&
        (!isDurationDirty || durationForm.isValid()) &&
        (!isScheduleDirty || isClearScheduleValid(scheduleForm.values));

    const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!canSave) return;
        if (isDurationDirty) {
            const { mode, ttlMinutes } = durationForm.values;
            updateSettings(
                {
                    cacheTtlSeconds:
                        mode === 'custom' && typeof ttlMinutes === 'number'
                            ? ttlMinutes * 60
                            : null,
                },
                { onSuccess: () => durationForm.resetDirty() },
            );
        }
        if (isScheduleDirty) {
            updateSchedule(toClearScheduleUpdate(scheduleForm.values), {
                onSuccess: () => scheduleForm.resetDirty(),
            });
        }
    };

    const selectProjection = (ttlSeconds: number) => {
        durationForm.setFieldValue('mode', 'custom');
        durationForm.setFieldValue('ttlMinutes', Math.round(ttlSeconds / 60));
    };

    return (
        <form onSubmit={handleSubmit}>
            <SettingsCard>
                <Stack gap="lg">
                    {showDuration && (
                        <Stack gap="md">
                            <Box>
                                <Title order={5}>Cache duration</Title>
                                <Text c="dimmed" fz="sm">
                                    Reuse query results until they expire.
                                </Text>
                            </Box>
                            <SegmentedControl
                                data={DURATION_MODE_OPTIONS}
                                disabled={isSaving}
                                w="fit-content"
                                value={durationForm.values.mode}
                                onChange={(value) =>
                                    durationForm.setFieldValue(
                                        'mode',
                                        value === 'custom'
                                            ? 'custom'
                                            : 'instanceDefault',
                                    )
                                }
                            />
                            {isCustom ? (
                                <NumberInput
                                    label="Cache duration (minutes)"
                                    min={MIN_TTL_MINUTES}
                                    max={MAX_TTL_MINUTES}
                                    step={1}
                                    rightSectionWidth={90}
                                    rightSection={
                                        <Text c="dimmed" fz="xs">
                                            {formatDurationHint(
                                                durationForm.values.ttlMinutes,
                                            )}
                                        </Text>
                                    }
                                    disabled={isSaving}
                                    {...durationForm.getInputProps(
                                        'ttlMinutes',
                                    )}
                                />
                            ) : (
                                <NumberInput
                                    label="Cache duration (minutes)"
                                    rightSectionWidth={90}
                                    rightSection={
                                        <Text c="dimmed" fz="xs">
                                            {formatDurationHint(
                                                instanceDefaultMinutes,
                                            )}
                                        </Text>
                                    }
                                    value={instanceDefaultMinutes}
                                    disabled
                                />
                            )}
                            {showProjections && (
                                <ResultsCacheTtlProjectionHint
                                    projectUuid={projectUuid}
                                    days={days}
                                    onSelect={selectProjection}
                                    disabled={isSaving}
                                />
                            )}
                        </Stack>
                    )}

                    {showDuration && showSchedule && <Divider />}

                    {showSchedule && (
                        <ResultsCacheClearScheduleFields
                            form={scheduleForm}
                            schedulerTimezone={schedulerTimezone}
                            disabled={isSaving}
                        />
                    )}

                    <Divider />

                    <Group justify="space-between" wrap="nowrap">
                        <Text fz="sm">
                            {showSchedule &&
                                (clearSchedule?.enabled &&
                                clearSchedule.nextRunAt
                                    ? `Next clear: ${formatCacheEventTime(
                                          clearSchedule.nextRunAt,
                                          schedulerTimezone,
                                      )}`
                                    : 'No clear scheduled')}
                        </Text>
                        <Button
                            type="submit"
                            loading={isSaving}
                            disabled={!canSave}
                        >
                            Save changes
                        </Button>
                    </Group>
                </Stack>
            </SettingsCard>
        </form>
    );
};
