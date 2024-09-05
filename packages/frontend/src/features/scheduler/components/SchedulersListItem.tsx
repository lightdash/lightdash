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
} from '@mantine/core';
import { IconCircleFilled, IconPencil, IconTrash } from '@tabler/icons-react';
import { useCallback, type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { useSchedulersEnabledUpdateMutation } from '../hooks/useSchedulersUpdateMutation';

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

    const handleToggle = useCallback(
        (enabled: boolean) => {
            mutateSchedulerEnabled(enabled);
        },
        [mutateSchedulerEnabled],
    );

    return (
        <Paper p="sm" mb="xs" withBorder sx={{ overflow: 'hidden' }}>
            <Group noWrap position="apart">
                <Stack spacing="xs" w={475}>
                    <Text fw={600} truncate>
                        {scheduler.name}
                    </Text>
                    <Group spacing="sm">
                        <Text color="gray" size={12}>
                            {getHumanReadableCronExpression(scheduler.cron)}
                        </Text>

                        <Box c="gray.4">
                            <MantineIcon icon={IconCircleFilled} size={5} />
                        </Box>

                        <Text color="gray" size={12}>
                            {scheduler.targets.length} recipients
                        </Text>
                    </Group>
                </Stack>
                <Group noWrap spacing="xs">
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
                                checked={scheduler.enabled}
                                onChange={() =>
                                    handleToggle(!scheduler.enabled)
                                }
                            />
                        </Box>
                    </Tooltip>

                    <Tooltip withinPortal label="Edit">
                        <ActionIcon
                            variant="light"
                            onClick={() => onEdit(scheduler.schedulerUuid)}
                        >
                            <MantineIcon icon={IconPencil} />
                        </ActionIcon>
                    </Tooltip>

                    <Tooltip withinPortal label="Delete">
                        <ActionIcon
                            variant="light"
                            onClick={() => onDelete(scheduler.schedulerUuid)}
                        >
                            <MantineIcon color="red" icon={IconTrash} />
                        </ActionIcon>
                    </Tooltip>
                </Group>
            </Group>
        </Paper>
    );
};

export default SchedulersListItem;
