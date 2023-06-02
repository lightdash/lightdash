import { ActionIcon, Group, Tabs, Title } from '@mantine/core';
import { IconClock, IconRefresh, IconSend } from '@tabler/icons-react';
import React, { FC } from 'react';
import { useQueryClient } from 'react-query';
import { useSchedulerLogs } from '../../hooks/scheduler/useScheduler';
import { useTableTabStyles } from '../../hooks/styles/useTableTabStyles';
import MantineIcon from '../common/MantineIcon';
import ResourceEmptyState from '../common/ResourceView/ResourceEmptyState';
import { SettingsCard } from '../common/Settings/SettingsCard';
import Logs from './LogsView';
import Schedulers from './SchedulersView';

const SchedulersView: FC<{ projectUuid: string }> = ({ projectUuid }) => {
    const { data } = useSchedulerLogs(projectUuid);
    const queryClient = useQueryClient();
    const tableTabStyles = useTableTabStyles();
    const emptyState = (
        <ResourceEmptyState
            title="No scheduled deliveries on this project"
            description="Go to a chart or dashboard to set up your first scheduled delivery"
        />
    );
    return (
        <SettingsCard style={{ overflow: 'visible' }} p={0} shadow="none">
            <Tabs
                classNames={tableTabStyles.classes}
                keepMounted={false}
                defaultValue="scheduled-deliveries"
            >
                <Group
                    align="center"
                    pr="md"
                    spacing="xs"
                    sx={{
                        flexGrow: 1,
                    }}
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
                            <Title order={6} fw={500} color="gray.7">
                                All schedulers
                            </Title>
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
                            <Title order={6} fw={500} color="gray.7">
                                Run history
                            </Title>
                        </Tabs.Tab>
                    </Tabs.List>
                    <ActionIcon
                        ml="auto"
                        onClick={async () =>
                            queryClient.invalidateQueries('schedulerLogs')
                        }
                    >
                        <MantineIcon
                            icon={IconRefresh}
                            size="lg"
                            color="gray.6"
                            stroke={2}
                        />
                    </ActionIcon>
                </Group>
                <Tabs.Panel value="scheduled-deliveries">
                    {data && data.schedulers.length > 0 ? (
                        <Schedulers {...data} projectUuid={projectUuid} />
                    ) : (
                        emptyState
                    )}
                </Tabs.Panel>
                <Tabs.Panel value="run-history">
                    {data && data.logs.length > 0 ? (
                        <Logs {...data} projectUuid={projectUuid} />
                    ) : (
                        emptyState
                    )}
                </Tabs.Panel>
            </Tabs>
        </SettingsCard>
    );
};

export default SchedulersView;
