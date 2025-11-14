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
import { useSearchParams } from 'react-router';
import { useSchedulerLogs } from '../../features/scheduler/hooks/useScheduler';
import useToaster from '../../hooks/toaster/useToaster';
import LoadingState from '../common/LoadingState';
import MantineIcon from '../common/MantineIcon';
import ResourceEmptyState from '../common/ResourceView/ResourceEmptyState';
import LogsTable from './LogsTable';
import SchedulersTable from './SchedulersTable';
import classes from './SchedulersView.module.css';

enum SchedulersViewTab {
    ALL_SCHEDULERS = 'scheduled-deliveries',
    RUN_HISTORY = 'run-history',
}

const SchedulersView: FC<{ projectUuid: string }> = ({ projectUuid }) => {
    const [searchParams, setSearchParams] = useSearchParams();
    const { data, isInitialLoading } = useSchedulerLogs({
        projectUuid,
        paginateArgs: { page: 1, pageSize: 1 },
    });
    const queryClient = useQueryClient();
    const { showToastSuccess } = useToaster();

    // Extract data from paginated response
    const schedulersData = data?.pages?.[0]?.data;

    const activeTab =
        searchParams.get('tab') === SchedulersViewTab.RUN_HISTORY
            ? SchedulersViewTab.RUN_HISTORY
            : SchedulersViewTab.ALL_SCHEDULERS;

    const handleTabChange = (value: string | null) => {
        const newParams = new URLSearchParams(searchParams);
        if (value === SchedulersViewTab.RUN_HISTORY) {
            newParams.set('tab', SchedulersViewTab.RUN_HISTORY);
        } else {
            newParams.delete('tab');
        }
        setSearchParams(newParams);
    };

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
                    value={activeTab}
                    onChange={handleTabChange}
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
                            value={SchedulersViewTab.ALL_SCHEDULERS}
                            leftSection={<MantineIcon icon={IconSend} />}
                        >
                            All schedulers
                        </Tabs.Tab>
                        <Tabs.Tab
                            value={SchedulersViewTab.RUN_HISTORY}
                            leftSection={<MantineIcon icon={IconClock} />}
                        >
                            Run history
                        </Tabs.Tab>
                    </Tabs.List>

                    <Tabs.Panel value={SchedulersViewTab.ALL_SCHEDULERS}>
                        <SchedulersTable projectUuid={projectUuid} />
                    </Tabs.Panel>
                    <Tabs.Panel value={SchedulersViewTab.RUN_HISTORY}>
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
