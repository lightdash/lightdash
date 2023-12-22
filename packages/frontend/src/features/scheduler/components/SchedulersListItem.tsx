import {
    getHumanReadableCronExpression,
    SchedulerAndTargets,
} from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Group,
    Paper,
    Stack,
    Text,
    Tooltip,
} from '@mantine/core';
import { IconCircleFilled, IconPencil, IconTrash } from '@tabler/icons-react';
import { FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';

type SchedulersListItemProps = {
    scheduler: SchedulerAndTargets;
    onEdit: (schedulerUuid: string) => void;
    onDelete: (schedulerUuid: string) => void;
};

const SchedulersListItem: FC<
    React.PropsWithChildren<SchedulersListItemProps>
> = ({ scheduler, onEdit, onDelete }) => {
    return (
        <Paper p="sm" mb="xs" withBorder sx={{ overflow: 'hidden' }}>
            <Group noWrap position="apart">
                <Stack spacing="xs" w={475}>
                    <Text fw={600} truncate>
                        {scheduler.name}
                    </Text>
                    <Group>
                        <Text color="gray" size={12}>
                            {getHumanReadableCronExpression(scheduler.cron)}
                        </Text>

                        {/* TODO: This icon should use Mantine icon,
                            but MantineIcon doesn't support filled icons atm.
                            Util we fix that, this style is imperfect
                        */}
                        <Box
                            sx={(theme) => ({
                                color: theme.colors.gray[4],
                                marginTop: '-6px',
                            })}
                        >
                            <IconCircleFilled style={{ width: 5, height: 5 }} />
                        </Box>

                        <Text color="gray" size={12}>
                            {scheduler.targets.length} recipients
                        </Text>
                    </Group>
                </Stack>
                <Group noWrap spacing="xs">
                    <Tooltip label="Edit">
                        <ActionIcon
                            variant="light"
                            onClick={() => onEdit(scheduler.schedulerUuid)}
                        >
                            <MantineIcon icon={IconPencil} />
                        </ActionIcon>
                    </Tooltip>
                    <ActionIcon
                        variant="light"
                        onClick={() => onDelete(scheduler.schedulerUuid)}
                    >
                        <MantineIcon color="red" icon={IconTrash} />
                    </ActionIcon>
                </Group>
            </Group>
        </Paper>
    );
};

export default SchedulersListItem;
