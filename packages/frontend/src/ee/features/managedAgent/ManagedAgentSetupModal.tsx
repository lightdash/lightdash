import { ManagedAgentScheduleOption } from '@lightdash/common';
import { Box, Group, Select, Stack, Text } from '@mantine-8/core';
import {
    IconBolt,
    IconChartBar,
    IconClock,
    IconTool,
    IconTrendingUp,
} from '@tabler/icons-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type FC, useState } from 'react';
import { lightdashApi } from '../../../api';
import MantineModal from '../../../components/common/MantineModal';
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

const SCHEDULE_OPTIONS = [
    { value: ManagedAgentScheduleOption.HOURLY, label: 'Hourly' },
    { value: ManagedAgentScheduleOption.DAILY, label: 'Daily' },
];

const CAPABILITIES = [
    {
        icon: IconClock,
        title: 'Stale content cleanup',
        detail: 'Flags charts & dashboards not viewed in 3+ months and preview projects older than 3 months. Zero-view content is soft-deleted.',
    },
    {
        icon: IconTool,
        title: 'Broken chart repair',
        detail: 'Detects invalid field references and automatically fixes them by creating new chart versions.',
    },
    {
        icon: IconChartBar,
        title: 'Content creation',
        detail: 'Explores your data model and creates useful charts in an "Agent Suggestions" space for review.',
    },
    {
        icon: IconTrendingUp,
        title: 'Insights',
        detail: 'Surfaces popular content that could be pinned or made more accessible.',
    },
];

// ts-unused-exports:disable-next-line
export const ManagedAgentSetupModal: FC<{
    projectUuid: string;
    opened: boolean;
    onClose: () => void;
    onEnabled: () => void;
}> = ({ projectUuid, opened, onClose, onEnabled }) => {
    const queryClient = useQueryClient();
    const [schedule, setSchedule] = useState(ManagedAgentScheduleOption.HOURLY);

    const mutation = useMutation({
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
    });

    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            title="Enable Autopilot"
            icon={IconBolt}
            size="lg"
            onConfirm={() => mutation.mutate()}
            confirmLabel="Enable"
        >
            <Stack gap="xl">
                {/* Description */}
                <Text fz="sm" c="dimmed">
                    An AI agent that monitors your project&apos;s health
                    automatically — cleaning up stale content, fixing broken
                    charts, and surfacing insights. All actions are logged and
                    reversible.
                </Text>

                {/* Capabilities */}
                <Stack gap="xs">
                    <Text fz="xs" fw={600} c="dimmed" tt="uppercase" lts={0.4}>
                        What it does
                    </Text>
                    {CAPABILITIES.map((cap) => (
                        <Group
                            key={cap.title}
                            gap="sm"
                            wrap="nowrap"
                            align="flex-start"
                            className={classes.capRow}
                        >
                            <Box className={classes.capIcon}>
                                <cap.icon size={14} />
                            </Box>
                            <div>
                                <Text fz="sm" fw={600}>
                                    {cap.title}
                                </Text>
                                <Text fz="xs" c="dimmed" lh={1.5}>
                                    {cap.detail}
                                </Text>
                            </div>
                        </Group>
                    ))}
                </Stack>

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
                        Frequency
                    </Text>
                    <Select
                        data={SCHEDULE_OPTIONS}
                        value={schedule}
                        onChange={(value) =>
                            value &&
                            setSchedule(value as ManagedAgentScheduleOption)
                        }
                        size="sm"
                    />
                    <Text fz="xs" c="dimmed" mt={6}>
                        All actions are logged and reversible. Created charts go
                        to an &quot;Agent Suggestions&quot; space for review.
                    </Text>
                </Box>
            </Stack>
        </MantineModal>
    );
};
