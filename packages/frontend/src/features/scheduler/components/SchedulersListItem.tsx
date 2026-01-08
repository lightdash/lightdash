import { subject } from '@casl/ability';
import {
    getHumanReadableCronExpression,
    type SchedulerAndTargets,
} from '@lightdash/common';
import {
    ActionIcon,
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
    IconPencil,
    IconSend,
    IconTrash,
} from '@tabler/icons-react';
import { useCallback, useMemo, useState, type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { useActiveProjectUuid } from '../../../hooks/useActiveProject';
import { useProject } from '../../../hooks/useProject';
import useApp from '../../../providers/App/useApp';
import { useSendNowSchedulerByUuid } from '../hooks/useScheduler';
import { useSchedulersEnabledUpdateMutation } from '../hooks/useSchedulersUpdateMutation';
import ConfirmSendNowModal from './ConfirmSendNowModal';

type SchedulersListItemProps = {
    scheduler: SchedulerAndTargets;
    onEdit: (schedulerUuid: string) => void;
    onDelete: (schedulerUuid: string) => void;
};

const SchedulersListItem: FC<SchedulersListItemProps> = ({
    scheduler,
    onEdit,
    onDelete,
}) => {
    const { mutate: mutateSchedulerEnabled } =
        useSchedulersEnabledUpdateMutation(scheduler.schedulerUuid);

    const sendNowMutation = useSendNowSchedulerByUuid(scheduler.schedulerUuid);
    const [isConfirmOpen, setIsConfirmOpen] = useState(false);

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
                    </Group>
                </Stack>
                {userCanManageScheduledDelivery && (
                    <Group wrap="nowrap" gap="xs">
                        <Tooltip
                            withinPortal
                            variant="xs"
                            maw={130}
                            label={
                                scheduler.enabled
                                    ? 'Toggle off to temporarily pause notifications'
                                    : 'Notifications paused. Toggle on to resume'
                            }
                        >
                            <Box mr="sm">
                                <Switch
                                    checked={scheduler.enabled}
                                    onChange={() =>
                                        handleToggle(!scheduler.enabled)
                                    }
                                />
                            </Box>
                        </Tooltip>

                        <Tooltip withinPortal label="Send now">
                            <ActionIcon
                                variant="light"
                                onClick={() => setIsConfirmOpen(true)}
                                radius="md"
                                color="ldDark.9"
                            >
                                <MantineIcon color="ldDark.9" icon={IconSend} />
                            </ActionIcon>
                        </Tooltip>

                        <Tooltip withinPortal label="Edit">
                            <ActionIcon
                                variant="light"
                                radius="md"
                                color="ldDark.9"
                                onClick={() => onEdit(scheduler.schedulerUuid)}
                            >
                                <MantineIcon
                                    color="ldDark.9"
                                    icon={IconPencil}
                                />
                            </ActionIcon>
                        </Tooltip>

                        <Tooltip withinPortal label="Delete">
                            <ActionIcon
                                variant="light"
                                color="red"
                                radius="md"
                                onClick={() =>
                                    onDelete(scheduler.schedulerUuid)
                                }
                            >
                                <MantineIcon icon={IconTrash} />
                            </ActionIcon>
                        </Tooltip>
                    </Group>
                )}
            </Group>
            <ConfirmSendNowModal
                opened={isConfirmOpen}
                onClose={() => setIsConfirmOpen(false)}
                schedulerName={scheduler.name}
                loading={sendNowMutation.isLoading}
                onConfirm={() => {
                    sendNowMutation.mutate();
                    setIsConfirmOpen(false);
                }}
            />
        </Paper>
    );
};

export default SchedulersListItem;
