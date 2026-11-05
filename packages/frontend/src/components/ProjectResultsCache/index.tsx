import { subject } from '@casl/ability';
import { type ResultsCacheStatsDays } from '@lightdash/common';
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
import { useState, type FC } from 'react';
import {
    useInvalidateResultsCache,
    useResultsCacheSettings,
    useUpdateResultsCacheSettings,
} from '../../hooks/useProjectResultsCacheSettings';
import useApp from '../../providers/App/useApp';
import MantineModal from '../common/MantineModal';
import { SettingsCard } from '../common/Settings/SettingsCard';
import SuboptimalState from '../common/SuboptimalState/SuboptimalState';
import { formatCacheEventTime } from './formatCacheEventTime';
import { ResultsCacheDurationCard } from './ResultsCacheDurationCard';
import { ResultsCacheStatsCard } from './ResultsCacheStatsCard';

type ClearCacheProps = {
    projectUuid: string;
    lastInvalidatedAt: Date | null;
    schedulerTimezone: string;
};

const ClearResultsCache: FC<ClearCacheProps> = ({
    projectUuid,
    lastInvalidatedAt,
    schedulerTimezone,
}) => {
    const [isConfirmOpen, setIsConfirmOpen] = useState(false);
    const { mutate: invalidateCache, isLoading } =
        useInvalidateResultsCache(projectUuid);

    return (
        <SettingsCard>
            <Group justify="space-between" wrap="nowrap">
                <Text fz="sm">
                    {lastInvalidatedAt
                        ? `Last cleared: ${formatCacheEventTime(
                              lastInvalidatedAt,
                              schedulerTimezone,
                          )}`
                        : 'Never cleared'}
                </Text>
                <Button
                    variant="default"
                    loading={isLoading}
                    onClick={() => setIsConfirmOpen(true)}
                >
                    Clear cache now
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
        </SettingsCard>
    );
};

type EnableCacheProps = {
    projectUuid: string;
    cacheEnabled: boolean;
    cacheEnabledSetByInstance: boolean;
    canToggle: boolean;
};

const getToggleLockReason = (
    cacheEnabledSetByInstance: boolean,
    canToggle: boolean,
): string | null => {
    if (cacheEnabledSetByInstance) {
        return 'Set by your instance admin. Contact them to change it.';
    }
    if (!canToggle) return 'Only project admins can change this.';
    return null;
};

const EnableResultsCache: FC<EnableCacheProps> = ({
    projectUuid,
    cacheEnabled,
    cacheEnabledSetByInstance,
    canToggle,
}) => {
    const { mutate: updateSettings, isLoading } =
        useUpdateResultsCacheSettings(projectUuid);
    const lockReason = getToggleLockReason(
        cacheEnabledSetByInstance,
        canToggle,
    );

    return (
        <SettingsCard>
            <Group justify="space-between" wrap="nowrap">
                <Box>
                    <Title order={5}>Enable results caching</Title>
                    {lockReason && (
                        <Text c="dimmed" fz="xs" mt="xs">
                            {lockReason}
                        </Text>
                    )}
                </Box>
                <Switch
                    aria-label="Enable results caching"
                    checked={cacheEnabled}
                    disabled={isLoading || lockReason !== null}
                    onChange={(event) =>
                        updateSettings({
                            cacheEnabled: event.currentTarget.checked,
                        })
                    }
                />
            </Group>
        </SettingsCard>
    );
};

type Props = {
    projectUuid: string;
};

const ProjectResultsCache: FC<Props> = ({ projectUuid }) => {
    const [days, setDays] = useState<ResultsCacheStatsDays>(7);
    const {
        data: settings,
        isLoading,
        isError,
    } = useResultsCacheSettings(projectUuid);
    const { user } = useApp();
    const canManage =
        user.data?.ability.can(
            'manage',
            subject('Project', {
                organizationUuid: user.data.organizationUuid,
                projectUuid,
            }),
        ) ?? false;

    if (isError) {
        return (
            <SuboptimalState title="Couldn't load results caching settings" />
        );
    }
    if (isLoading || !settings) {
        return <Loader size="sm" />;
    }

    const showSchedule =
        canManage &&
        (settings.cacheEnabled || settings.clearSchedule?.enabled === true);

    return (
        <Stack gap="lg">
            <EnableResultsCache
                projectUuid={projectUuid}
                cacheEnabled={settings.cacheEnabled}
                cacheEnabledSetByInstance={settings.cacheEnabledSetByInstance}
                canToggle={canManage}
            />
            {settings.cacheEnabled && canManage && (
                <ResultsCacheStatsCard
                    projectUuid={projectUuid}
                    days={days}
                    onDaysChange={setDays}
                />
            )}
            {(settings.cacheEnabled || showSchedule) && (
                <ResultsCacheDurationCard
                    projectUuid={projectUuid}
                    days={days}
                    initialTtlSeconds={settings.cacheTtlSeconds}
                    instanceDefaultSeconds={settings.instanceDefaultTtlSeconds}
                    clearSchedule={settings.clearSchedule}
                    schedulerTimezone={settings.schedulerTimezone}
                    showDuration={settings.cacheEnabled}
                    showProjections={settings.cacheEnabled && canManage}
                    showSchedule={showSchedule}
                />
            )}
            {settings.cacheEnabled && canManage && (
                <ClearResultsCache
                    projectUuid={projectUuid}
                    lastInvalidatedAt={settings.lastInvalidatedAt}
                    schedulerTimezone={settings.schedulerTimezone}
                />
            )}
        </Stack>
    );
};

export default ProjectResultsCache;
