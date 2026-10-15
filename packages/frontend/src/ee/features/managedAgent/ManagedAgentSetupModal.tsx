import { type ApiError, ManagedAgentScheduleOption } from '@lightdash/common';
import { Box, Group, Select, Stack, Text } from '@mantine/core';
import {
    IconChartBar,
    IconClock,
    IconTarget,
    IconTool,
    IconTrendingUp,
} from '@tabler/icons-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type TFunction } from 'i18next';
import { type FC, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { lightdashApi } from '../../../api';
import MantineModal from '../../../components/common/MantineModal';
import useToaster from '../../../hooks/toaster/useToaster';
import useApp from '../../../providers/App/useApp';
import { useManagedAgentRuntime } from './hooks/useManagedAgentRuntime';
import { ManagedAgentRuntimeDetails } from './ManagedAgentRuntimeDetails';
import classes from './ManagedAgentSetupModal.module.css';

const updateSettings = async (
    projectUuid: string,
    body: { enabled: boolean; schedule: ManagedAgentScheduleOption },
) =>
    lightdashApi({
        url: `/projects/${projectUuid}/managed-agent/settings`,
        method: 'PATCH',
        body: JSON.stringify(body),
    });

const getScheduleOptions = (t: TFunction) => [
    {
        value: ManagedAgentScheduleOption.EVERY_6_HOURS,
        label: t('setup.schedule.every6Hours'),
    },
    {
        value: ManagedAgentScheduleOption.EVERY_12_HOURS,
        label: t('setup.schedule.every12Hours'),
    },
    {
        value: ManagedAgentScheduleOption.DAILY,
        label: t('setup.schedule.daily'),
    },
    {
        value: ManagedAgentScheduleOption.EVERY_2_DAYS,
        label: t('setup.schedule.every2Days'),
    },
    {
        value: ManagedAgentScheduleOption.WEEKLY,
        label: t('setup.schedule.weekly'),
    },
];

const getCapabilities = (t: TFunction) => [
    {
        key: 'staleCleanup',
        icon: IconClock,
        title: t('setup.capabilities.staleCleanup.title'),
        detail: t('setup.capabilities.staleCleanup.detail'),
    },
    {
        key: 'brokenChartRepair',
        icon: IconTool,
        title: t('setup.capabilities.brokenChartRepair.title'),
        detail: t('setup.capabilities.brokenChartRepair.detail'),
    },
    {
        key: 'contentCreation',
        icon: IconChartBar,
        title: t('setup.capabilities.contentCreation.title'),
        detail: t('setup.capabilities.contentCreation.detail'),
    },
    {
        key: 'insights',
        icon: IconTrendingUp,
        title: t('setup.capabilities.insights.title'),
        detail: t('setup.capabilities.insights.detail'),
    },
];

// ts-unused-exports:disable-next-line
export const ManagedAgentSetupModal: FC<{
    projectUuid: string;
    opened: boolean;
    onClose: () => void;
    onEnabled: () => void;
}> = ({ projectUuid, opened, onClose, onEnabled }) => {
    const { t } = useTranslation('managedAgent');
    const queryClient = useQueryClient();
    const { user } = useApp();
    const runtime = useManagedAgentRuntime(projectUuid, opened);
    const { showToastApiError } = useToaster();
    const [schedule, setSchedule] = useState(ManagedAgentScheduleOption.DAILY);

    const mutation = useMutation<unknown, ApiError>({
        mutationFn: () =>
            updateSettings(projectUuid, {
                enabled: true,
                schedule,
            }),
        onSuccess: () => {
            void queryClient.invalidateQueries({
                queryKey: ['managed-agent-settings', projectUuid],
            });
            void queryClient.invalidateQueries({
                queryKey: ['managed-agent-actions', projectUuid],
            });
            onEnabled();
        },
        onError: (error) => {
            showToastApiError({
                title: t('setup.enableFailed'),
                apiError: error.error,
            });
        },
    });

    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            title={t('setup.title')}
            icon={IconTarget}
            size="lg"
            onConfirm={() => mutation.mutate()}
            confirmLabel={t('setup.enable')}
            confirmLoading={mutation.isLoading}
            confirmDisabled={
                runtime.isLoading || runtime.isError || !!runtime.data?.error
            }
            cancelDisabled={mutation.isLoading}
        >
            <Stack gap="xl">
                {/* Description */}
                <Text fz="sm" c="dimmed">
                    {t('setup.description')}
                </Text>

                {/* Capabilities */}
                <Stack gap="xs">
                    <Text fz="xs" fw={600} c="dimmed" tt="uppercase" lts={0.4}>
                        {t('setup.whatItDoes')}
                    </Text>
                    {getCapabilities(t).map((cap) => (
                        <Group
                            key={cap.key}
                            gap="sm"
                            wrap="nowrap"
                            align="flex-start"
                            className={classes.capRow}
                        >
                            <Box className={classes.capIcon}>
                                <cap.icon size={14} />
                            </Box>
                            <Box>
                                <Text fz="sm" fw={600}>
                                    {cap.title}
                                </Text>
                                <Text fz="xs" c="dimmed" lh={1.5}>
                                    {cap.detail}
                                </Text>
                            </Box>
                        </Group>
                    ))}
                </Stack>

                <ManagedAgentRuntimeDetails
                    runtime={runtime}
                    canManageAiSettings={
                        user.data?.ability.can('manage', 'Organization') ??
                        false
                    }
                />

                {/* Schedule */}
                <Box>
                    <Text
                        fz="xs"
                        fw={600}
                        c="dimmed"
                        tt="uppercase"
                        lts={0.4}
                        mb={6}
                    >
                        {t('setup.frequency')}
                    </Text>
                    <Select
                        data={getScheduleOptions(t)}
                        value={schedule}
                        onChange={(value) =>
                            value &&
                            setSchedule(value as ManagedAgentScheduleOption)
                        }
                        size="sm"
                    />
                    <Text fz="xs" c="dimmed" mt={6}>
                        {t('setup.frequencyHint')}
                    </Text>
                </Box>
            </Stack>
        </MantineModal>
    );
};
