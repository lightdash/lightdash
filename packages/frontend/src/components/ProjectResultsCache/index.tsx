import { subject } from '@casl/ability';
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
import { formatDistanceToNow } from 'date-fns';
import { useState, type FC } from 'react';
import {
    useInvalidateResultsCache,
    useResultsCacheSettings,
    useUpdateResultsCacheSettings,
} from '../../hooks/useProjectResultsCacheSettings';
import useApp from '../../providers/App/useApp';
import MantineModal from '../common/MantineModal';
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
                        <Text c="dimmed" fz="xs">
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

type ClearCacheProps = {
    projectUuid: string;
    lastInvalidatedAt: Date | null;
};

const ClearResultsCache: FC<ClearCacheProps> = ({
    projectUuid,
    lastInvalidatedAt,
}) => {
    const [isConfirmOpen, setIsConfirmOpen] = useState(false);
    const { mutate: invalidateCache, isLoading } =
        useInvalidateResultsCache(projectUuid);

    return (
        <SettingsGridCard>
            <Box>
                <Title order={5}>Clear cached results</Title>
                <Text c="dimmed" fz="xs">
                    Charts and dashboards query the warehouse again the next
                    time they load.
                </Text>
            </Box>
            <Group justify="space-between">
                <Text c="dimmed" fz="sm">
                    {lastInvalidatedAt
                        ? `Last cleared ${formatDistanceToNow(
                              new Date(lastInvalidatedAt),
                              { addSuffix: true },
                          )}`
                        : 'Never cleared'}
                </Text>
                <Button
                    variant="default"
                    loading={isLoading}
                    onClick={() => setIsConfirmOpen(true)}
                >
                    Clear cache
                </Button>
            </Group>
            <MantineModal
                opened={isConfirmOpen}
                onClose={() => setIsConfirmOpen(false)}
                title="Clear cached results?"
                role="alertdialog"
                description="Cached results in this project stop being reused. The next load of each chart and dashboard runs its query against the warehouse, so it can take longer."
                confirmLabel="Clear cache"
                confirmLoading={isLoading}
                onConfirm={() =>
                    invalidateCache(undefined, {
                        onSettled: () => setIsConfirmOpen(false),
                    })
                }
            />
        </SettingsGridCard>
    );
};

type Props = {
    projectUuid: string;
};

const ProjectResultsCache: FC<Props> = ({ projectUuid }) => {
    const { data: settings, isLoading } = useResultsCacheSettings(projectUuid);
    const { user } = useApp();
    const canClearCache =
        user.data?.ability.can(
            'manage',
            subject('Project', {
                organizationUuid: user.data.organizationUuid,
                projectUuid,
            }),
        ) ?? false;

    return (
        <Stack gap="lg">
            <SettingsGridCard>
                <Box>
                    <Title order={5}>Cache duration</Title>
                    <Text c="dimmed" fz="xs">
                        How long cached results are kept before Lightdash
                        queries the warehouse again.
                    </Text>
                </Box>
                {isLoading || !settings ? (
                    <Loader size="sm" />
                ) : (
                    <ProjectResultsCacheForm
                        projectUuid={projectUuid}
                        initialTtlSeconds={settings.cacheTtlSeconds}
                        instanceDefaultSeconds={
                            settings.instanceDefaultTtlSeconds
                        }
                    />
                )}
            </SettingsGridCard>
            {canClearCache && settings && (
                <ClearResultsCache
                    projectUuid={projectUuid}
                    lastInvalidatedAt={settings.lastInvalidatedAt}
                />
            )}
        </Stack>
    );
};

export default ProjectResultsCache;
