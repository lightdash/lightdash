import { ActionIcon, Group, Stack, Tabs, Title, Tooltip } from '@mantine/core';
import { IconClock, IconRefresh, IconSend } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import React, { type FC } from 'react';
import { useSchedulerLogs } from '../../features/scheduler/hooks/useScheduler';
import { useTableTabStyles } from '../../hooks/styles/useTableTabStyles';
import useToaster from '../../hooks/toaster/useToaster';
import LoadingState from '../common/LoadingState';
import MantineIcon from '../common/MantineIcon';
import ResourceEmptyState from '../common/ResourceView/ResourceEmptyState';
import { SettingsCard } from '../common/Settings/SettingsCard';
import Logs from './LogsView';
import Schedulers from './SchedulersView';

const SchedulersView: FC<{ projectUuid: string }> = ({ projectUuid }) => {
    const { data, isInitialLoading } = useSchedulerLogs(projectUuid);
    const tableTabStyles = useTableTabStyles();
    const queryClient = useQueryClient();
    const { showToastSuccess } = useToaster();

    const handleRefresh = async () => {
        await queryClient.invalidateQueries(['schedulerLogs']);

        showToastSuccess({
            title: 'Scheduled deliveries refreshed successfully',
        });
    };

    if (isInitialLoading) {
        return <LoadingState title="Loading scheduled deliveries" />;
    }
    return (
        <Stack spacing="sm">
            <Group spacing="xs" align="center" pr="md">
                <Title order={5}>Scheduled Deliveries</Title>
                <Tooltip label="Click to refresh the status of the scheduled deliveries">
                    <ActionIcon onClick={handleRefresh}>
                        <MantineIcon
                            icon={IconRefresh}
                            size="lg"
                            color="gray.6"
                            stroke={2}
                        />
                    </ActionIcon>
                </Tooltip>
            </Group>

            <Tabs
                classNames={tableTabStyles.classes}
                keepMounted={false}
                defaultValue="scheduled-deliveries"
            >
                <Tabs.List>
                    <Tabs.Tab
                        value="scheduled-deliveries"
                        icon={
                            <MantineIcon
                                icon={IconSend}
                                size="md"
                                color="gray.7"
                            />
                        }
                    >
                        All schedulers
                    </Tabs.Tab>
                    <Tabs.Tab
                        value="run-history"
                        icon={
                            <MantineIcon
                                icon={IconClock}
                                size="md"
                                color="gray.7"
                            />
                        }
                    >
                        Run history
                    </Tabs.Tab>
                </Tabs.List>
                <Tabs.Panel value="scheduled-deliveries">
                    <SettingsCard
                        style={{ overflow: 'visible' }}
                        p={0}
                        shadow="none"
                    >
                        {data && data.schedulers.length > 0 ? (
                            <Schedulers {...data} projectUuid={projectUuid} />
                        ) : (
                            <ResourceEmptyState
                                title="No scheduled deliveries on this project"
                                description="Go to a chart or dashboard to set up your first scheduled delivery"
                            />
                        )}
                    </SettingsCard>
                </Tabs.Panel>
                <Tabs.Panel value="run-history">
                    <SettingsCard
                        style={{ overflow: 'visible' }}
                        p={0}
                        shadow="none"
                    >
                        {data && data.schedulers.length > 0 ? (
                            data.logs.length > 0 ? (
                                <Logs {...data} projectUuid={projectUuid} />
                            ) : (
                                <ResourceEmptyState
                                    title="Scheduled deliveries have not run any jobs as of now"
                                    description="Check in later or hit the refresh button to see if any jobs have run"
                                />
                            )
                        ) : (
                            <ResourceEmptyState
                                title="No scheduled deliveries on this project"
                                description="Go to a chart or dashboard to set up your first scheduled delivery"
                            />
                        )}
                    </SettingsCard>
                </Tabs.Panel>
            </Tabs>
        </Stack>
    );
};

export default SchedulersView;
