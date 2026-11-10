import {
    Box,
    Group,
    MultiSelect,
    Select,
    Stack,
    Switch,
    Text,
    Title,
} from '@mantine/core';
import { type UseFormReturnType } from '@mantine/form';
import { type FC } from 'react';
import {
    isClearScheduleValid,
    type ClearScheduleFormValues,
    type ClearScheduleFrequency,
} from './clearScheduleForm';

const FREQUENCY_OPTIONS: { value: ClearScheduleFrequency; label: string }[] = [
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

type Props = {
    form: UseFormReturnType<ClearScheduleFormValues>;
    schedulerTimezone: string;
    disabled: boolean;
};

export const ResultsCacheClearScheduleFields: FC<Props> = ({
    form,
    schedulerTimezone,
    disabled,
}) => {
    const { enabled, frequency, hours } = form.values;
    const isFieldDisabled = disabled || !enabled;

    return (
        <Stack gap="md">
            <Group justify="space-between" wrap="nowrap" align="flex-start">
                <Box>
                    <Title order={5}>Scheduled clearing</Title>
                    <Text c="dimmed" fz="sm">
                        Clear cached results automatically at specific times.
                    </Text>
                </Box>
                <Switch
                    aria-label="Scheduled clearing"
                    disabled={disabled}
                    {...form.getInputProps('enabled', { type: 'checkbox' })}
                />
            </Group>
            <Stack gap="xs">
                <Group align="flex-start" wrap="nowrap">
                    <Select
                        label="Frequency"
                        data={FREQUENCY_OPTIONS}
                        allowDeselect={false}
                        disabled={isFieldDisabled}
                        flex={2}
                        {...form.getInputProps('frequency')}
                    />
                    {frequency === 'weekly' && (
                        <Select
                            label="Day"
                            data={DAY_OPTIONS}
                            allowDeselect={false}
                            disabled={isFieldDisabled}
                            flex={2}
                            value={String(form.values.dayOfWeek)}
                            onChange={(value) =>
                                form.setFieldValue('dayOfWeek', Number(value))
                            }
                        />
                    )}
                    <MultiSelect
                        label="Times"
                        placeholder={hours.length === 0 ? 'Select times' : ''}
                        data={HOUR_OPTIONS}
                        disabled={isFieldDisabled}
                        flex={3}
                        error={
                            isClearScheduleValid(form.values)
                                ? undefined
                                : 'Select at least one time'
                        }
                        value={hours.map(String)}
                        onChange={(values) =>
                            form.setFieldValue(
                                'hours',
                                values.map(Number).sort((a, b) => a - b),
                            )
                        }
                    />
                </Group>
                <Text c="dimmed" fz="xs">
                    {`Project time zone: ${schedulerTimezone}`}
                </Text>
            </Stack>
        </Stack>
    );
};
