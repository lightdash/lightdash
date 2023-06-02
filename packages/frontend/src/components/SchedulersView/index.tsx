import { Box, Group, Tabs, Title } from '@mantine/core';
import { IconClock, IconRefresh, IconSend } from '@tabler/icons-react';
import React, { FC } from 'react';
import { useSchedulerLogs } from '../../hooks/scheduler/useScheduler';
import { useTableTabStyles } from '../../hooks/styles/useTableTabStyles';
import MantineIcon from '../common/MantineIcon';
import { SettingsCard } from '../common/Settings/SettingsCard';
import Logs from './LogsView';
import Schedulers from './SchedulersView';

const SchedulersView: FC<{ projectUuid: string }> = ({ projectUuid }) => {
    const { data } = useSchedulerLogs(projectUuid);
    const tableTabStyles = useTableTabStyles();

    return (
        <SettingsCard style={{ overflow: 'visible' }} p={0} shadow="none">
            <Tabs
                classNames={tableTabStyles.classes}
                keepMounted={false}
                defaultValue="scheduled-deliveries"
                mb="sm"
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
                    <Box
                        ml="auto"
                        onClick={() => null}
                        sx={{
                            '&:hover': {
                                cursor: 'pointer',
                            },
                        }}
                    >
                        <MantineIcon
                            icon={IconRefresh}
                            size="lg"
                            color="gray.6"
                            stroke={2}
                        />
                    </Box>
                </Group>
                <Tabs.Panel value="scheduled-deliveries">
                    {data ? (
                        <Schedulers {...data} projectUuid={projectUuid} />
                    ) : null}
                </Tabs.Panel>
                <Tabs.Panel value="run-history">
                    {data ? <Logs {...data} projectUuid={projectUuid} /> : null}
                </Tabs.Panel>
            </Tabs>
        </SettingsCard>
    );
};

export default SchedulersView;
