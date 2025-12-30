import {
    SchedulerFormat,
    getHumanReadableCronExpression,
    type Scheduler,
} from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Card,
    Flex,
    Group,
    Menu,
    Stack,
    Switch,
    Text,
    Tooltip,
} from '@mantine-8/core';
import {
    IconDots,
    IconPencil,
    IconRefresh,
    IconTrash,
} from '@tabler/icons-react';
import { useState, type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { useChartSchedulers } from '../../../features/scheduler/hooks/useChartSchedulers';
import { useActiveProjectUuid } from '../../../hooks/useActiveProject';
import { useProject } from '../../../hooks/useProject';
import useTracking from '../../../providers/Tracking/useTracking';
import { EventName } from '../../../types/Events';
import { useSendNowScheduler } from '../../scheduler/hooks/useScheduler';
import { useSchedulersEnabledUpdateMutation } from '../../scheduler/hooks/useSchedulersUpdateMutation';
import { SyncModalAction } from '../providers/types';
import { useSyncModal } from '../providers/useSyncModal';

const ToggleSyncEnabled: FC<{ scheduler: Scheduler }> = ({ scheduler }) => {
    const { mutate: mutateSchedulerEnabled } =
        useSchedulersEnabledUpdateMutation(scheduler.schedulerUuid);

    const [schedulerEnabled, setSchedulerEnabled] = useState<boolean>(
        scheduler.enabled,
    ); // To avoid delay on toggle

    return (
        <Tooltip
            withinPortal
            label={
                scheduler.enabled
                    ? 'Toggle off to temporarily pause notifications'
                    : 'Notifications paused. Toggle on to resume'
            }
            variant="xs"
            maw={100}
        >
            <Box>
                <Switch
                    mr="sm"
                    checked={schedulerEnabled}
                    onChange={() => {
                        mutateSchedulerEnabled(!schedulerEnabled);
                        setSchedulerEnabled(!schedulerEnabled);
                    }}
                />
            </Box>
        </Tooltip>
    );
};

export const SyncModalView: FC<{ chartUuid: string }> = ({ chartUuid }) => {
    const { data } = useChartSchedulers(chartUuid);
    const { setAction, setCurrentSchedulerUuid } = useSyncModal();
    const googleSheetsSyncs = data?.filter(
        ({ format }) => format === SchedulerFormat.GSHEETS,
    );

    const { activeProjectUuid } = useActiveProjectUuid();
    const { data: project } = useProject(activeProjectUuid);

    const { mutate: mutateSendNow, isLoading: isSendingNowLoading } =
        useSendNowScheduler();
    const { track } = useTracking();

    if (!project) return null;

    return (
        <Stack gap="lg" mih={300} p="md">
            {googleSheetsSyncs && googleSheetsSyncs.length ? (
                <Stack pt="md" pb="xl">
                    {googleSheetsSyncs.map((sync) => (
                        <Card
                            key={sync.schedulerUuid}
                            withBorder
                            pos="relative"
                            p="xs"
                            style={{
                                overflow: 'visible', // To show tooltips on hover
                            }}
                        >
                            <Flex align="center" justify="space-between">
                                <Stack gap="xs">
                                    <Text fz="sm" fw={500}>
                                        {sync.name}
                                    </Text>

                                    <Flex
                                        align="center"
                                        justify="space-between"
                                    >
                                        <Text span size="xs" c="ldGray.7">
                                            {getHumanReadableCronExpression(
                                                sync.cron,
                                                sync.timezone ||
                                                    project.schedulerTimezone,
                                            )}
                                        </Text>
                                    </Flex>
                                </Stack>
                                <Group>
                                    <Tooltip withinPortal label="Sync now">
                                        <ActionIcon
                                            color="ldDark.7"
                                            variant="light"
                                            disabled={isSendingNowLoading}
                                            onClick={() => {
                                                track({
                                                    name: EventName.SCHEDULER_SEND_NOW_BUTTON,
                                                });
                                                mutateSendNow(sync);
                                            }}
                                        >
                                            <MantineIcon
                                                color="ldDark.9"
                                                icon={IconRefresh}
                                            />
                                        </ActionIcon>
                                    </Tooltip>

                                    <ToggleSyncEnabled scheduler={sync} />
                                    <Menu
                                        shadow="md"
                                        withinPortal
                                        withArrow
                                        offset={{
                                            crossAxis: -4,
                                            mainAxis: -4,
                                        }}
                                        position="bottom-end"
                                    >
                                        <Menu.Target>
                                            <ActionIcon
                                                variant="subtle"
                                                color="ldDark.9"
                                            >
                                                <MantineIcon
                                                    color="ldDark.9"
                                                    icon={IconDots}
                                                />
                                            </ActionIcon>
                                        </Menu.Target>

                                        <Menu.Dropdown>
                                            <Menu.Item
                                                disabled={isSendingNowLoading}
                                                leftSection={
                                                    <MantineIcon
                                                        icon={IconPencil}
                                                    />
                                                }
                                                onClick={() => {
                                                    setAction(
                                                        SyncModalAction.EDIT,
                                                    );
                                                    setCurrentSchedulerUuid(
                                                        sync.schedulerUuid,
                                                    );
                                                }}
                                            >
                                                Edit
                                            </Menu.Item>
                                            <Menu.Item
                                                leftSection={
                                                    <MantineIcon
                                                        color="red"
                                                        icon={IconTrash}
                                                    />
                                                }
                                                onClick={() => {
                                                    setAction(
                                                        SyncModalAction.DELETE,
                                                    );
                                                    setCurrentSchedulerUuid(
                                                        sync.schedulerUuid,
                                                    );
                                                }}
                                            >
                                                Delete
                                            </Menu.Item>
                                        </Menu.Dropdown>
                                    </Menu>
                                </Group>
                            </Flex>
                        </Card>
                    ))}
                </Stack>
            ) : (
                <Group justify="center" ta="center" gap="xs" my="sm" pt="md">
                    <Text fz="lg" fw={500} c="ldGray.7">
                        This chart has no Syncs set up yet
                    </Text>
                    <Text fz="md" fw={400} c="ldGray.7">
                        Get started by clicking 'Create new Sync' to seamlessly
                        integrate your chart data with Google Sheets
                    </Text>
                </Group>
            )}
        </Stack>
    );
};
