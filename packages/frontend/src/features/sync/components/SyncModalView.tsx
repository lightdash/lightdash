import {
    SchedulerFormat,
    getHumanReadableCronExpression,
    type Scheduler,
} from '@lightdash/common';
import {
    ActionIcon,
    Anchor,
    Box,
    Button,
    Card,
    Flex,
    Group,
    Menu,
    Popover,
    Stack,
    Switch,
    Text,
    Tooltip,
} from '@mantine/core';
import {
    IconDots,
    IconInfoCircle,
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
        <>
            <Stack spacing="lg" mih={300}>
                {googleSheetsSyncs && googleSheetsSyncs.length ? (
                    <Stack pt="md" pb="xl">
                        {googleSheetsSyncs.map((sync) => (
                            <Card
                                key={sync.schedulerUuid}
                                withBorder
                                pos="relative"
                                p="xs"
                                sx={{
                                    overflow: 'visible', // To show tooltips on hover
                                }}
                            >
                                <Flex align="center" justify="space-between">
                                    <Stack spacing="xs">
                                        <Text fz="sm" fw={500}>
                                            {sync.name}
                                        </Text>

                                        <Flex
                                            align="center"
                                            justify="space-between"
                                        >
                                            <Text
                                                span
                                                size="xs"
                                                color="ldGray.6"
                                            >
                                                {getHumanReadableCronExpression(
                                                    sync.cron,
                                                    sync.timezone ||
                                                        project.schedulerTimezone,
                                                )}
                                            </Text>
                                        </Flex>
                                    </Stack>
                                    <Group mr="lg">
                                        <Tooltip withinPortal label="Sync now">
                                            <ActionIcon
                                                color="ldGray.7"
                                                p="xs"
                                                size="lg"
                                                disabled={isSendingNowLoading}
                                                onClick={() => {
                                                    track({
                                                        name: EventName.SCHEDULER_SEND_NOW_BUTTON,
                                                    });
                                                    mutateSendNow(sync);
                                                }}
                                            >
                                                <MantineIcon
                                                    icon={IconRefresh}
                                                />
                                            </ActionIcon>
                                        </Tooltip>

                                        <ToggleSyncEnabled scheduler={sync} />
                                    </Group>
                                </Flex>

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
                                            pos="absolute"
                                            top={0}
                                            right={0}
                                        >
                                            <MantineIcon icon={IconDots} />
                                        </ActionIcon>
                                    </Menu.Target>

                                    <Menu.Dropdown>
                                        <Menu.Item
                                            disabled={isSendingNowLoading}
                                            icon={
                                                <MantineIcon
                                                    icon={IconPencil}
                                                />
                                            }
                                            onClick={() => {
                                                setAction(SyncModalAction.EDIT);
                                                setCurrentSchedulerUuid(
                                                    sync.schedulerUuid,
                                                );
                                            }}
                                        >
                                            Edit
                                        </Menu.Item>
                                        <Menu.Item
                                            icon={
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
                            </Card>
                        ))}
                    </Stack>
                ) : (
                    <Group
                        position="center"
                        ta="center"
                        spacing="xs"
                        my="sm"
                        pt="md"
                    >
                        <Text fz="sm" fw={450} c="ldGray.7">
                            This chart has no Syncs set up yet
                        </Text>
                        <Text fz="xs" fw={400} c="ldGray.6">
                            Get started by clicking 'Create new Sync' to
                            seamlessly integrate your chart data with Google
                            Sheets
                        </Text>
                    </Group>
                )}
            </Stack>
            <Flex
                sx={(theme) => ({
                    position: 'sticky',
                    backgroundColor: theme.colors.background[0],
                    borderTop: `1px solid ${theme.colors.ldGray[4]}`,
                    bottom: 0,
                    zIndex: 2,
                    margin: -16, // TODO: is there a way to negate theme values?
                    padding: theme.spacing.md,
                })}
                justify="space-between"
                align="center"
            >
                <Popover withinPortal width={150} withArrow>
                    <Popover.Target>
                        <Button
                            size="xs"
                            fz={9}
                            variant="subtle"
                            color="gray"
                            leftIcon={
                                <MantineIcon size={12} icon={IconInfoCircle} />
                            }
                        >
                            Google API Services User Data Policy
                        </Button>
                    </Popover.Target>

                    <Popover.Dropdown>
                        <Text fz={9}>
                            Lightdash's use and transfer of information received
                            from Google APIs adhere to{' '}
                            <Anchor
                                target="_blank"
                                href="https://developers.google.com/terms/api-services-user-data-policy"
                            >
                                Google API Services User Data Policy
                            </Anchor>
                            , including the Limited Use requirements.
                        </Text>
                    </Popover.Dropdown>
                </Popover>

                <Button
                    size="sm"
                    display="block"
                    ml="auto"
                    onClick={() => setAction(SyncModalAction.CREATE)}
                >
                    Create New Sync
                </Button>
            </Flex>
        </>
    );
};
