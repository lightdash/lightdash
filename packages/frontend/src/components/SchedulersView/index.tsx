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
import useToaster from '../../hooks/toaster/useToaster';
import MantineIcon from '../common/MantineIcon';
import LogsTable from './LogsTable';
import SchedulersTable from './SchedulersTable';
import classes from './SchedulersView.module.css';

enum SchedulersViewTab {
    ALL_SCHEDULERS = 'scheduled-deliveries',
    RUN_HISTORY = 'run-history',
}

const SchedulersView: FC<{ projectUuid: string }> = ({ projectUuid }) => {
    const [searchParams, setSearchParams] = useSearchParams();
    const queryClient = useQueryClient();
    const { showToastSuccess } = useToaster();

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
            queryClient.invalidateQueries(['paginatedSchedulers']),
            queryClient.invalidateQueries(['schedulerRuns']),
        ]);

        showToastSuccess({
            title: 'Scheduled deliveries refreshed successfully',
        });
    };

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
                                    color="ldGray.6"
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
                        <LogsTable projectUuid={projectUuid} />
                    </Tabs.Panel>
                </Tabs>
            </Stack>
        </Card>
    );
};

export default SchedulersView;
