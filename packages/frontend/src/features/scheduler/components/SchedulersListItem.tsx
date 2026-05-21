import { subject } from '@casl/ability';
import {
    getHumanReadableCronExpression,
    type SchedulerAndTargets,
} from '@lightdash/common';
import {
    ActionIcon,
    Badge,
    Box,
    Group,
    Paper,
    Stack,
    Switch,
    Text,
    Tooltip,
} from '@mantine-8/core';
import {
    IconCircleFilled,
    IconHistory,
    IconPencil,
    IconSend,
    IconTrash,
} from '@tabler/icons-react';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { useCallback, useMemo, useState, type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { getRunStatusConfig } from '../../../components/SchedulersView/SchedulersViewUtils';
import { useActiveProjectUuid } from '../../../hooks/useActiveProject';
import { useProject } from '../../../hooks/useProject';
import useApp from '../../../providers/App/useApp';
import { useSendNowSchedulerByUuid } from '../hooks/useScheduler';
import { useSchedulersEnabledUpdateMutation } from '../hooks/useSchedulersUpdateMutation';
import ConfirmPauseSchedulerModal from './ConfirmPauseSchedulerModal';
import ConfirmSendNowModal from './ConfirmSendNowModal';

dayjs.extend(relativeTime);

type SchedulersListItemProps = {
    scheduler: SchedulerAndTargets;
    onEdit: (schedulerUuid: string) => void;
    onDelete: (schedulerUuid: string) => void;
    onViewHistory: (scheduler: SchedulerAndTargets) => void;
};

const SchedulersListItem: FC<SchedulersListItemProps> = ({
    scheduler,
    onEdit,
    onDelete,
    onViewHistory,
}) => {
    const { mutate: mutateSchedulerEnabled } =
        useSchedulersEnabledUpdateMutation(scheduler.schedulerUuid);

    const sendNowMutation = useSendNowSchedulerByUuid(scheduler.schedulerUuid);
    const [isConfirmSendNowOpen, setIsConfirmSendNowOpen] = useState(false);
    const [isConfirmPauseOpen, setIsConfirmPauseOpen] = useState(false);

    const hasHistoryResource = !!(
        scheduler.dashboardUuid || scheduler.savedChartUuid
    );

    const handleToggle = useCallback(
        (enabled: boolean) => {
            mutateSchedulerEnabled(enabled);
        },
        [mutateSchedulerEnabled],
    );

    const { activeProjectUuid } = useActiveProjectUuid();
    const { data: project } = useProject(activeProjectUuid);
    const { user } = useApp();

    const userCanManageScheduledDelivery = useMemo(() => {
        return user.data?.ability?.can(
            'manage',
            subject('ScheduledDeliveries', {
                organizationUuid: user.data?.organizationUuid,
                projectUuid: activeProjectUuid,
                userUuid: scheduler.createdBy,
            }),
        );
    }, [user.data, activeProjectUuid, scheduler.createdBy]);
    const userCanCreateScheduledDelivery = useMemo(() => {
        return user.data?.ability?.can(
            'create',
            subject('ScheduledDeliveries', {
                organizationUuid: user.data?.organizationUuid,
                projectUuid: activeProjectUuid,
            }),
        );
    }, [user.data, activeProjectUuid]);

    const latestRunStatusConfig = useMemo(
        () =>
            scheduler.latestRun
                ? getRunStatusConfig(scheduler.latestRun.runStatus)
                : null,
        [scheduler.latestRun],
    );

    if (!project) {
        return null;
    }

    return (
        <Paper p="sm" mb="xs" withBorder style={{ overflow: 'hidden' }}>
            <Group wrap="nowrap" justify="space-between">
                <Stack gap="xs" w={475}>
                    <Text fw={600} truncate>
                        {scheduler.name}
                    </Text>
                    <Group gap="sm">
                        <Text c="ldGray.6" fz={12}>
                            {getHumanReadableCronExpression(
                                scheduler.cron,
                                scheduler.timezone || project.schedulerTimezone,
                            )}
                        </Text>

                        <Box c="ldGray.4">
                            <MantineIcon icon={IconCircleFilled} size={5} />
                        </Box>

                        <Text c="ldGray.6" fz={12}>
                            {scheduler.targets.length} recipients
                        </Text>

                        <Box c="ldGray.4">
                            <MantineIcon icon={IconCircleFilled} size={5} />
                        </Box>

                        {scheduler.latestRun && latestRunStatusConfig ? (
                            <Tooltip
                                withinPortal
                                label={
                                    hasHistoryResource &&
                                    userCanManageScheduledDelivery
                                        ? `View run history (last run ${dayjs(
                                              scheduler.latestRun.scheduledTime,
                                          ).fromNow()})`
                                        : `Last run ${dayjs(
                                              scheduler.latestRun.scheduledTime,
                                          ).fromNow()} (${dayjs(
                                              scheduler.latestRun.scheduledTime,
                                          ).format('YYYY/MM/DD HH:mm')})`
                                }
                            >
                                <Badge
                                    variant="light"
                                    size="sm"
                                    radius="sm"
                                    color={latestRunStatusConfig.color}
                                    leftSection={
                                        <MantineIcon
                                            icon={latestRunStatusConfig.icon}
                                            size={10}
                                        />
                                    }
                                    onClick={
                                        hasHistoryResource &&
                                        userCanManageScheduledDelivery
                                            ? () => onViewHistory(scheduler)
                                            : undefined
                                    }
                                    style={
                                        hasHistoryResource &&
                                        userCanManageScheduledDelivery
                                            ? { cursor: 'pointer' }
                                            : undefined
                                    }
                                >
                                    {latestRunStatusConfig.label}
                                </Badge>
                            </Tooltip>
                        ) : (
                            <Text c="ldGray.6" fz={12} fs="italic">
                                Not run yet
                            </Text>
                        )}
                    </Group>
                </Stack>
                {!userCanManageScheduledDelivery &&
                    userCanCreateScheduledDelivery && (
                        <Tooltip withinPortal label="Send now">
                            <ActionIcon
                                variant="light"
                                onClick={() => setIsConfirmSendNowOpen(true)}
                                radius="md"
                                color="ldDark.9"
                            >
                                <MantineIcon color="ldDark.9" icon={IconSend} />
                            </ActionIcon>
                        </Tooltip>
                    )}
                {userCanManageScheduledDelivery && (
                    <Group wrap="nowrap" gap="xs">
                        <Tooltip
                            withinPortal
                            variant="xs"
                            maw={130}
                            label={
                                scheduler.enabled
                                    ? 'Toggle off to temporarily pause the scheduled delivery'
                                    : 'Scheduled delivery paused. Toggle on to resume'
                            }
                        >
                            <Switch
                                size="sm"
                                checked={scheduler.enabled}
                                onChange={() => {
                                    if (scheduler.enabled) {
                                        setIsConfirmPauseOpen(true);
                                    } else {
                                        handleToggle(true);
                                    }
                                }}
                            />
                        </Tooltip>

                        <ActionIcon.Group>
                            <Tooltip withinPortal label="Send now">
                                <ActionIcon
                                    variant="default"
                                    onClick={() =>
                                        setIsConfirmSendNowOpen(true)
                                    }
                                >
                                    <MantineIcon
                                        icon={IconSend}
                                        color="ldGray.6"
                                    />
                                </ActionIcon>
                            </Tooltip>

                            {hasHistoryResource && (
                                <Tooltip withinPortal label="View run history">
                                    <ActionIcon
                                        variant="default"
                                        onClick={() => onViewHistory(scheduler)}
                                    >
                                        <MantineIcon
                                            icon={IconHistory}
                                            color="ldGray.6"
                                        />
                                    </ActionIcon>
                                </Tooltip>
                            )}

                            <Tooltip withinPortal label="Edit">
                                <ActionIcon
                                    variant="default"
                                    onClick={() =>
                                        onEdit(scheduler.schedulerUuid)
                                    }
                                >
                                    <MantineIcon
                                        icon={IconPencil}
                                        color="ldGray.6"
                                    />
                                </ActionIcon>
                            </Tooltip>

                            <Tooltip withinPortal label="Delete">
                                <ActionIcon
                                    variant="default"
                                    onClick={() =>
                                        onDelete(scheduler.schedulerUuid)
                                    }
                                >
                                    <MantineIcon icon={IconTrash} color="red" />
                                </ActionIcon>
                            </Tooltip>
                        </ActionIcon.Group>
                    </Group>
                )}
            </Group>
            <ConfirmSendNowModal
                opened={isConfirmSendNowOpen}
                onClose={() => setIsConfirmSendNowOpen(false)}
                schedulerName={scheduler.name}
                loading={sendNowMutation.isLoading}
                onConfirm={() => {
                    sendNowMutation.mutate();
                    setIsConfirmSendNowOpen(false);
                }}
            />
            <ConfirmPauseSchedulerModal
                opened={isConfirmPauseOpen}
                onClose={() => setIsConfirmPauseOpen(false)}
                schedulerName={scheduler.name}
                onConfirm={() => {
                    handleToggle(false);
                    setIsConfirmPauseOpen(false);
                }}
                description="This will pause the scheduled delivery. It will not run until it is enabled again."
            />
        </Paper>
    );
};

export default SchedulersListItem;
