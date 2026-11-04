import { Button, Tabs } from '@mantine/core';
import { IconClock, IconRefresh, IconSend } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import { useSearchParams } from 'react-router';
import { useGetSlackChannelName } from '../../hooks/slack/useGetSlackChannelName';
import MantineIcon from '../common/MantineIcon';
import { SettingsPage } from '../common/Settings/SettingsPage';
import LogsTable from './LogsTable';
import SchedulersTable from './SchedulersTable';
import { SchedulersViewTab } from './SchedulersViewConstants';
import { useRefreshSchedulers } from './useRefreshSchedulers';

const SchedulersView: FC<{ projectUuid?: string; isUserScope?: boolean }> = ({
    projectUuid,
    isUserScope = false,
}) => {
    const [searchParams, setSearchParams] = useSearchParams();
    const handleRefresh = useRefreshSchedulers();

    const activeTab =
        searchParams.get('tab') === SchedulersViewTab.RUN_HISTORY
            ? SchedulersViewTab.RUN_HISTORY
            : SchedulersViewTab.ALL_SCHEDULERS;

    // Track slack channel IDs from scheduler data to ensure they're included in the query
    const [schedulerSlackChannelIds, setSchedulerSlackChannelIds] = useState<
        string[]
    >([]);
    const { getSlackChannelName } = useGetSlackChannelName({
        includeChannelIds: schedulerSlackChannelIds,
    });

    const handleTabChange = (value: string | null) => {
        const newParams = new URLSearchParams(searchParams);
        if (value === SchedulersViewTab.RUN_HISTORY) {
            newParams.set('tab', SchedulersViewTab.RUN_HISTORY);
        } else {
            newParams.delete('tab');
        }
        setSearchParams(newParams);
    };

    if (isUserScope) {
        return (
            <SettingsPage
                title="My scheduled deliveries"
                description="Review and manage deliveries scheduled across your projects."
                actions={
                    <Button
                        size="xs"
                        variant="white"
                        leftSection={<MantineIcon icon={IconRefresh} />}
                        onClick={handleRefresh}
                    >
                        Refresh
                    </Button>
                }
            >
                <SchedulersTable
                    getSlackChannelName={getSlackChannelName}
                    onSlackChannelIdsChange={setSchedulerSlackChannelIds}
                    isUserScope
                />
            </SettingsPage>
        );
    }

    return (
        <Tabs
            keepMounted={false}
            value={activeTab}
            onChange={handleTabChange}
            variant="pills"
        >
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

            <Tabs.Panel value={SchedulersViewTab.ALL_SCHEDULERS} pt="sm">
                {projectUuid ? (
                    <SchedulersTable
                        projectUuid={projectUuid}
                        getSlackChannelName={getSlackChannelName}
                        onSlackChannelIdsChange={setSchedulerSlackChannelIds}
                    />
                ) : null}
            </Tabs.Panel>
            <Tabs.Panel value={SchedulersViewTab.RUN_HISTORY} pt="sm">
                <LogsTable
                    projectUuid={projectUuid}
                    getSlackChannelName={getSlackChannelName}
                />
            </Tabs.Panel>
        </Tabs>
    );
};

export default SchedulersView;
