import {
    ActionIcon,
    Button,
    Card,
    Group,
    Stack,
    Tabs,
    Title,
    Tooltip,
} from '@mantine/core';
import { IconClock, IconRefresh, IconSend } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import { useGetSlackChannelName } from '../../hooks/slack/useGetSlackChannelName';
import useToaster from '../../hooks/toaster/useToaster';
import MantineIcon from '../common/MantineIcon';
import { SettingsPage } from '../common/Settings/SettingsPage';
import LogsTable from './LogsTable';
import SchedulersTable from './SchedulersTable';
import classes from './SchedulersView.module.css';
import { SchedulersViewTab } from './SchedulersViewConstants';

const SchedulersView: FC<{ projectUuid?: string; isUserScope?: boolean }> = ({
    projectUuid,
    isUserScope = false,
}) => {
    const { t } = useTranslation('scheduler');
    const [searchParams, setSearchParams] = useSearchParams();
    const queryClient = useQueryClient();
    const { showToastSuccess } = useToaster();

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

    const handleRefresh = async () => {
        const invalidateQueries = [
            queryClient.invalidateQueries(['paginatedSchedulers']),
            queryClient.invalidateQueries(['schedulerRuns']),
        ];

        await Promise.all(invalidateQueries);

        showToastSuccess({
            title: t('schedulersView.refreshSuccess'),
        });
    };

    if (isUserScope) {
        return (
            <SettingsPage
                title={t('schedulersView.myScheduledDeliveries')}
                description={t(
                    'schedulersView.myScheduledDeliveriesDescription',
                )}
                actions={
                    <Button
                        size="xs"
                        variant="white"
                        leftSection={<MantineIcon icon={IconRefresh} />}
                        onClick={handleRefresh}
                    >
                        {t('schedulersView.refresh')}
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
        <Card>
            <Stack gap="sm">
                <Tabs
                    keepMounted={false}
                    value={activeTab}
                    onChange={handleTabChange}
                    variant="pills"
                >
                    <Group
                        gap="xs"
                        align="center"
                        justify="space-between"
                        className={classes.header}
                    >
                        <Title order={5}>{t('schedulersView.title')}</Title>
                        <Tooltip label={t('schedulersView.refreshTooltip')}>
                            <ActionIcon onClick={handleRefresh} size="xs">
                                <MantineIcon
                                    icon={IconRefresh}
                                    color="dimmed"
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
                            {t('schedulersView.tabs.allSchedulers')}
                        </Tabs.Tab>
                        <Tabs.Tab
                            value={SchedulersViewTab.RUN_HISTORY}
                            leftSection={<MantineIcon icon={IconClock} />}
                        >
                            {t('schedulersView.tabs.runHistory')}
                        </Tabs.Tab>
                    </Tabs.List>

                    <Tabs.Panel value={SchedulersViewTab.ALL_SCHEDULERS}>
                        {projectUuid ? (
                            <SchedulersTable
                                projectUuid={projectUuid}
                                getSlackChannelName={getSlackChannelName}
                                onSlackChannelIdsChange={
                                    setSchedulerSlackChannelIds
                                }
                            />
                        ) : null}
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
