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
import { DurationInput } from '../common/DurationInput';
import { formatDuration } from '../common/DurationInput/duration';
import { SettingsGridCard } from '../common/Settings/SettingsCard';

type FormValues = {
    useInstanceDefault: boolean;
    ttlSeconds: number | null;
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

    const form = useForm<FormValues>({
        initialValues: {
            useInstanceDefault: initialTtlSeconds === null,
            ttlSeconds: initialTtlSeconds ?? instanceDefaultSeconds,
        },
        validate: {
            ttlSeconds: (value, values) => {
                if (values.useInstanceDefault) return null;
                if (
                    value === null ||
                    value < MIN_RESULTS_CACHE_TTL_SECONDS ||
                    value > MAX_RESULTS_CACHE_TTL_SECONDS
                ) {
                    return `Enter a duration between ${formatDuration(
                        MIN_RESULTS_CACHE_TTL_SECONDS,
                    )} and ${formatDuration(MAX_RESULTS_CACHE_TTL_SECONDS)}`;
                }
                return null;
            },
        },
    });

    return (
        <form
            onSubmit={form.onSubmit(({ useInstanceDefault, ttlSeconds }) => {
                updateSettings({
                    cacheTtlSeconds: useInstanceDefault ? null : ttlSeconds,
                });
            })}
        >
            <Stack gap="md">
                <Switch
                    label="Use the default cache duration"
                    description={`Cached results expire after ${formatDuration(
                        instanceDefaultSeconds,
                    )}.`}
                    disabled={isUpdating}
                    {...form.getInputProps('useInstanceDefault', {
                        type: 'checkbox',
                    })}
                />

                <DurationInput
                    label="Cache duration"
                    units={['minutes', 'hours', 'days']}
                    defaultUnit="hours"
                    minSeconds={MIN_RESULTS_CACHE_TTL_SECONDS}
                    maxSeconds={MAX_RESULTS_CACHE_TTL_SECONDS}
                    disabled={isUpdating || form.values.useInstanceDefault}
                    value={form.values.ttlSeconds}
                    onChange={(seconds) =>
                        form.setFieldValue('ttlSeconds', seconds)
                    }
                    error={form.errors.ttlSeconds}
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
