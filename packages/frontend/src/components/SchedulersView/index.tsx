import {
    ActionIcon,
    Card,
    Group,
    Stack,
    Tabs,
    Title,
    Tooltip,
} from '@mantine-8/core';
import { IconClock, IconRefresh, IconSend } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { type FC } from 'react';
import { useSchedulerLogs } from '../../features/scheduler/hooks/useScheduler';
import useToaster from '../../hooks/toaster/useToaster';
import LoadingState from '../common/LoadingState';
import MantineIcon from '../common/MantineIcon';
import ResourceEmptyState from '../common/ResourceView/ResourceEmptyState';
import LogsTable from './LogsTable';
import SchedulersTable from './SchedulersTable';
import classes from './SchedulersView.module.css';

const SchedulersView: FC<{ projectUuid: string }> = ({ projectUuid }) => {
    const { data, isInitialLoading } = useSchedulerLogs({
        projectUuid,
        paginateArgs: { page: 1, pageSize: 1 },
    });
    const queryClient = useQueryClient();
    const { showToastSuccess } = useToaster();

    // Extract data from paginated response
    const schedulersData = data?.pages?.[0]?.data;

    const handleRefresh = async () => {
        await Promise.all([
            queryClient.invalidateQueries(['schedulerLogs']),
            queryClient.invalidateQueries(['paginatedSchedulers']),
        ]);

        showToastSuccess({
            title: 'Scheduled deliveries refreshed successfully',
        });
    };

    if (isInitialLoading) {
        return <LoadingState title="Loading scheduled deliveries" />;
    }
    return (
        <Card>
            <Stack gap="sm">
                <Tabs
                    keepMounted={false}
                    defaultValue="scheduled-deliveries"
                    variant="pills"
                    classNames={{
                        list: classes.tabsList,
                        tab: classes.tab,
                        tabSection: classes.tabSection,
                        panel: classes.panel,
                    }}
                >
                    <Group
                        gap="xs"
                        align="center"
                        justify="space-between"
                        className={classes.header}
                    >
                        <Title order={5}>Scheduled Deliveries</Title>
                        <Tooltip label="Click to refresh the status of the scheduled deliveries">
                            <ActionIcon
                                onClick={handleRefresh}
                                variant="subtle"
                                size="xs"
                            >
                                <MantineIcon
                                    icon={IconRefresh}
                                    color="gray.6"
                                    stroke={2}
                                />
                            </ActionIcon>
                        </Tooltip>
                    </Group>
                    <Tabs.List>
                        <Tabs.Tab
                            value="scheduled-deliveries"
                            leftSection={<MantineIcon icon={IconSend} />}
                        >
                            All schedulers
                        </Tabs.Tab>
                        <Tabs.Tab
                            value="run-history"
                            leftSection={<MantineIcon icon={IconClock} />}
                        >
                            Run history
                        </Tabs.Tab>
                    </Tabs.List>

                    <Tabs.Panel value="scheduled-deliveries">
                        <SchedulersTable projectUuid={projectUuid} />
                    </Tabs.Panel>
                    <Tabs.Panel value="run-history">
                        {schedulersData &&
                        schedulersData.schedulers.length > 0 ? (
                            schedulersData.logs.length > 0 ? (
                                <LogsTable projectUuid={projectUuid} />
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
                    </Tabs.Panel>
                </Tabs>
            </Stack>
        </Card>
    );
};

export default SchedulersView;
