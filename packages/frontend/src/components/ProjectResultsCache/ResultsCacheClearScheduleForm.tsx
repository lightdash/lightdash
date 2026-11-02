import {
    assertUnreachable,
    parseResultsCacheClearCron,
    resultsCacheClearCadenceToCron,
    type ResultsCacheClearCadence,
    type ResultsCacheClearSchedule,
} from '@lightdash/common';
import {
    Button,
    Group,
    MultiSelect,
    Select,
    Stack,
    Switch,
    Text,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { type FC } from 'react';
import { useUpdateResultsCacheClearSchedule } from '../../hooks/useProjectResultsCacheSettings';

type Frequency = ResultsCacheClearCadence['frequency'];

const FREQUENCY_OPTIONS: { value: Frequency; label: string }[] = [
    { value: 'daily', label: 'Every day' },
    { value: 'weekly', label: 'Every week' },
];

const DAY_OPTIONS = [
    'Sunday',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
].map((label, index) => ({ value: String(index), label }));

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, hour) => ({
    value: String(hour),
    label: `${String(hour).padStart(2, '0')}:00`,
}));

const DEFAULT_DAY_OF_WEEK = 1;
const DEFAULT_HOURS = [6];

type FormValues = {
    enabled: boolean;
    frequency: Frequency;
    dayOfWeek: number;
    hours: number[];
};

const getInitialValues = (
    clearSchedule: ResultsCacheClearSchedule | null,
): FormValues => {
    const cadence = clearSchedule
        ? parseResultsCacheClearCron(clearSchedule.cron)
        : null;
    return {
        enabled: clearSchedule?.enabled ?? false,
        frequency: cadence?.frequency ?? 'daily',
        dayOfWeek:
            cadence?.frequency === 'weekly'
                ? cadence.dayOfWeek
                : DEFAULT_DAY_OF_WEEK,
        hours: cadence?.hours ?? DEFAULT_HOURS,
    };
};

const toCadence = ({
    frequency,
    dayOfWeek,
    hours,
}: FormValues): ResultsCacheClearCadence => {
    switch (frequency) {
        case 'daily':
            return { frequency, hours };
        case 'weekly':
            return { frequency, dayOfWeek, hours };
        default:
            return assertUnreachable(frequency, 'Unknown frequency');
    }
};

const formatNextRun = (nextRunAt: Date, timezone: string): string =>
    new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: timezone,
    }).format(new Date(nextRunAt));

type Props = {
    projectUuid: string;
    clearSchedule: ResultsCacheClearSchedule | null;
    schedulerTimezone: string;
};

export const ResultsCacheClearScheduleForm: FC<Props> = ({
    projectUuid,
    clearSchedule,
    schedulerTimezone,
}) => {
    const { mutate: updateSchedule, isLoading } =
        useUpdateResultsCacheClearSchedule(projectUuid);
    const form = useForm<FormValues>({
        initialValues: getInitialValues(clearSchedule),
    });
    const { enabled, frequency, hours } = form.values;
    const isDisabled = isLoading || !enabled;
    const isMissingHours = hours.length === 0;

    return (
        <form
            onSubmit={form.onSubmit((values) =>
                updateSchedule(
                    {
                        enabled: values.enabled,
                        cron: resultsCacheClearCadenceToCron(toCadence(values)),
                    },
                    { onSuccess: () => form.resetDirty() },
                ),
            )}
        >
            <Stack gap="md">
                <Switch
                    label="Enabled"
                    description={`Times use the project's default time zone (${schedulerTimezone}).`}
                    disabled={isLoading}
                    {...form.getInputProps('enabled', { type: 'checkbox' })}
                />
                <Group grow align="flex-start">
                    <Select
                        label="Frequency"
                        data={FREQUENCY_OPTIONS}
                        allowDeselect={false}
                        disabled={isDisabled}
                        {...form.getInputProps('frequency')}
                    />
                    {frequency === 'weekly' && (
                        <Select
                            label="Day"
                            data={DAY_OPTIONS}
                            allowDeselect={false}
                            disabled={isDisabled}
                            value={String(form.values.dayOfWeek)}
                            onChange={(value) =>
                                form.setFieldValue('dayOfWeek', Number(value))
                            }
                        />
                    )}
                </Group>
                <MultiSelect
                    label="Times"
                    placeholder={hours.length === 0 ? 'Select times' : ''}
                    data={HOUR_OPTIONS}
                    disabled={isDisabled}
                    error={
                        isMissingHours ? 'Select at least one time' : undefined
                    }
                    value={hours.map(String)}
                    onChange={(values) =>
                        form.setFieldValue(
                            'hours',
                            values.map(Number).sort((a, b) => a - b),
                        )
                    }
                />
                <Group justify="space-between">
                    <Text c="dimmed" fz="sm">
                        {clearSchedule?.nextRunAt
                            ? `Next clear: ${formatNextRun(
                                  clearSchedule.nextRunAt,
                                  schedulerTimezone,
                              )}`
                            : 'No clear scheduled'}
                    </Text>
                    <Button
                        type="submit"
                        loading={isLoading}
                        disabled={!form.isDirty() || isMissingHours}
                    >
                        Save
                    </Button>
                </Group>
            </Stack>
        </form>
    );
};
