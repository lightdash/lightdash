import {
    MAX_RESULTS_CACHE_TTL_SECONDS,
    MIN_RESULTS_CACHE_TTL_SECONDS,
} from '@lightdash/common';
import {
    Box,
    Button,
    Group,
    Loader,
    Stack,
    Switch,
    Text,
    Title,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { type FC } from 'react';
import {
    useResultsCacheSettings,
    useUpdateResultsCacheSettings,
} from '../../hooks/useProjectResultsCacheSettings';
import { NumberInput } from '../common/NumberInput';
import { SettingsGridCard } from '../common/Settings/SettingsCard';

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
    if (minutes > MINUTES_PER_HOUR) {
        const hours = minutes / MINUTES_PER_HOUR;
        return plural(
            Number.isInteger(hours) ? hours : Number(hours.toFixed(1)),
            'hour',
        );
    }
    return plural(minutes, 'minute');
};

const formatDurationHint = (minutes: number | ''): string | null =>
    typeof minutes === 'number' && minutes > MINUTES_PER_HOUR
        ? `= ${formatDuration(minutes)}`
        : null;

type FormValues = {
    useInstanceDefault: boolean;
    ttlMinutes: number | '';
};

type FormProps = {
    projectUuid: string;
    initialTtlSeconds: number | null;
    instanceDefaultSeconds: number;
};

const ProjectResultsCacheForm: FC<FormProps> = ({
    projectUuid,
    initialTtlSeconds,
    instanceDefaultSeconds,
}) => {
    const { mutate: updateSettings, isLoading: isUpdating } =
        useUpdateResultsCacheSettings(projectUuid);
    const instanceDefaultMinutes = Math.round(instanceDefaultSeconds / 60);

    const form = useForm<FormValues>({
        initialValues: {
            useInstanceDefault: initialTtlSeconds === null,
            ttlMinutes:
                initialTtlSeconds === null
                    ? instanceDefaultMinutes
                    : Math.round(initialTtlSeconds / 60),
        },
        validate: {
            ttlMinutes: (value, values) => {
                if (values.useInstanceDefault) return null;
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

    return (
        <form
            onSubmit={form.onSubmit(({ useInstanceDefault, ttlMinutes }) => {
                if (useInstanceDefault) {
                    updateSettings({ cacheTtlSeconds: null });
                } else if (typeof ttlMinutes === 'number') {
                    updateSettings({ cacheTtlSeconds: ttlMinutes * 60 });
                }
            })}
        >
            <Stack gap="md">
                <Switch
                    label="Use the default cache duration"
                    description={`Cached results expire after ${formatDuration(
                        instanceDefaultMinutes,
                    )}.`}
                    disabled={isUpdating}
                    {...form.getInputProps('useInstanceDefault', {
                        type: 'checkbox',
                    })}
                />

                <NumberInput
                    label="Cache duration (minutes)"
                    min={MIN_TTL_MINUTES}
                    max={MAX_TTL_MINUTES}
                    step={1}
                    rightSectionWidth={90}
                    rightSection={
                        <Text c="ldGray.6" fz="xs">
                            {formatDurationHint(form.values.ttlMinutes)}
                        </Text>
                    }
                    disabled={isUpdating || form.values.useInstanceDefault}
                    {...form.getInputProps('ttlMinutes')}
                />

                <Group justify="flex-end">
                    <Button
                        type="submit"
                        loading={isUpdating}
                        disabled={isUpdating || !form.isValid()}
                    >
                        Save
                    </Button>
                </Group>
            </Stack>
        </form>
    );
};

type Props = {
    projectUuid: string;
};

const ProjectResultsCache: FC<Props> = ({ projectUuid }) => {
    const { data: settings, isLoading } = useResultsCacheSettings(projectUuid);

    return (
        <SettingsGridCard>
            <Box>
                <Title order={5}>Cache duration</Title>
                <Text c="ldGray.6" fz="xs">
                    How long cached results are kept before Lightdash queries
                    the warehouse again.
                </Text>
            </Box>
            {isLoading || !settings ? (
                <Loader size="sm" />
            ) : (
                <ProjectResultsCacheForm
                    projectUuid={projectUuid}
                    initialTtlSeconds={settings.cacheTtlSeconds}
                    instanceDefaultSeconds={settings.instanceDefaultTtlSeconds}
                />
            )}
        </SettingsGridCard>
    );
};

export default ProjectResultsCache;
