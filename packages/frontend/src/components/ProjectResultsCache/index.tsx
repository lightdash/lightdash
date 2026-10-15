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
import { type TFunction } from 'i18next';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
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

const formatDuration = (
    minutes: number,
    t: TFunction<'projectSettings'>,
): string => {
    if (minutes >= 2 * MINUTES_PER_DAY && minutes % MINUTES_PER_DAY === 0) {
        return t('resultsCache.duration.days', {
            count: minutes / MINUTES_PER_DAY,
        });
    }
    if (minutes > MINUTES_PER_HOUR) {
        const hours = minutes / MINUTES_PER_HOUR;
        return t('resultsCache.duration.hours', {
            count: Number.isInteger(hours) ? hours : Number(hours.toFixed(1)),
        });
    }
    return t('resultsCache.duration.minutes', { count: minutes });
};

const formatDurationHint = (
    minutes: number | '',
    t: TFunction<'projectSettings'>,
): string | null =>
    typeof minutes === 'number' && minutes > MINUTES_PER_HOUR
        ? t('resultsCache.duration.hint', {
              duration: formatDuration(minutes, t),
          })
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
    const { t } = useTranslation('projectSettings');
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
                    return t('resultsCache.form.ttlInvalid', {
                        min: MIN_TTL_MINUTES,
                        max: MAX_TTL_MINUTES,
                    });
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
                    label={t('resultsCache.form.useDefault.label')}
                    description={t('resultsCache.form.useDefault.description', {
                        duration: formatDuration(instanceDefaultMinutes, t),
                    })}
                    disabled={isUpdating}
                    {...form.getInputProps('useInstanceDefault', {
                        type: 'checkbox',
                    })}
                />

                <NumberInput
                    label={t('resultsCache.form.ttlLabel')}
                    min={MIN_TTL_MINUTES}
                    max={MAX_TTL_MINUTES}
                    step={1}
                    rightSectionWidth={90}
                    rightSection={
                        <Text c="dimmed" fz="xs">
                            {formatDurationHint(form.values.ttlMinutes, t)}
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
                        {t('actions.save', { ns: 'common' })}
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
    const { t } = useTranslation('projectSettings');
    const { data: settings, isLoading } = useResultsCacheSettings(projectUuid);

    return (
        <SettingsGridCard>
            <Box>
                <Title order={5}>{t('resultsCache.title')}</Title>
                <Text c="dimmed" fz="xs">
                    {t('resultsCache.description')}
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
