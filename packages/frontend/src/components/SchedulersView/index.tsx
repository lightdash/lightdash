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
import { type FC, useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useGetSlack, useSlackChannels } from '../../hooks/slack/useSlack';
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

    const {
        data: slackInstallation,
        isInitialLoading: isLoadingSlackInstallation,
    } = useGetSlack();
    const organizationHasSlack = !!slackInstallation?.organizationUuid;

    // Track slack channel IDs from scheduler data to ensure they're included in the query
    const [schedulerSlackChannelIds, setSchedulerSlackChannelIds] = useState<
        string[]
    >([]);

    const slackChannelsQuery = useSlackChannels(
        '',
        {
            excludeArchived: false,
            includeChannelIds:
                schedulerSlackChannelIds.length > 0
                    ? schedulerSlackChannelIds
                    : undefined,
        },
        { enabled: organizationHasSlack && !isLoadingSlackInstallation },
    );

    // Create a map of Slack channel ID -> name
    const slackChannelMap = useMemo(() => {
        const map = new Map<string, string>();
        slackChannelsQuery?.data?.forEach((channel) => {
            map.set(channel.id, channel.name);
        });
        return map;
    }, [slackChannelsQuery?.data]);

    // Callback to get Slack channel name from ID
    const getSlackChannelName = useCallback(
        (channelId: string): string | null => {
            return slackChannelMap.get(channelId) || null;
        },
        [slackChannelMap],
    );

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
                        <SchedulersTable
                            projectUuid={projectUuid}
                            getSlackChannelName={getSlackChannelName}
                            onSlackChannelIdsChange={
                                setSchedulerSlackChannelIds
                            }
                        />
                    </Tabs.Panel>
                    <Tabs.Panel value={SchedulersViewTab.RUN_HISTORY}>
                        <LogsTable
                            projectUuid={projectUuid}
                            getSlackChannelName={getSlackChannelName}
                        />
                    </Tabs.Panel>
                </Tabs>
            </Stack>
        </Card>
    );
};

export default SchedulersView;
