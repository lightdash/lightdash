import { Comment } from '@lightdash/common';
import {
    ActionIcon,
    Avatar,
    Box,
    Grid,
    Group,
    Text,
    Tooltip,
} from '@mantine/core';
import { useHover } from '@mantine/hooks';
import { IconTrash } from '@tabler/icons-react';
import { FC, useCallback } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { useRemoveComment } from '../hooks/useComments';
import { getNameInitials } from '../utils/getNameInitials';
import { CommentTimestamp } from './CommentTimestamp';

type Props = {
    projectUuid: string;
    dashboardUuid: string;
    dashboardTileUuid: string;
    reply: Comment;
};

export const Reply: FC<{ reply: Comment } & Props> = ({
    reply,
    dashboardTileUuid,
    dashboardUuid,
}) => {
    const { mutateAsync: removeComment } = useRemoveComment();
    const { ref, hovered } = useHover();
    const handleRemove = useCallback(
        async (commentId: string) => {
            await removeComment({
                dashboardUuid,
                dashboardTileUuid,
                commentId,
            });
        },
        [dashboardTileUuid, dashboardUuid, removeComment],
    );

    return (
        <Box key={reply.commentId} ref={ref}>
            <Grid columns={24}>
                <Grid.Col span={2}>
                    <Avatar radius="xl" size="sm">
                        {getNameInitials(reply.user.name)}
                    </Avatar>
                </Grid.Col>
                <Grid.Col span={22}>
                    <Group position="apart">
                        <Group spacing="xs">
                            <Text fz="sm" fw={500}>
                                {reply.user.name}
                            </Text>
                            <CommentTimestamp timestamp={reply.createdAt} />
                        </Group>
                        <Group spacing="two">
                            {reply.canRemove && (
                                <Tooltip label="Remove">
                                    <ActionIcon
                                        size="xs"
                                        opacity={hovered ? 1 : 0}
                                        onClick={() =>
                                            handleRemove(reply.commentId)
                                        }
                                        variant="light"
                                        color="gray"
                                    >
                                        <MantineIcon icon={IconTrash} />
                                    </ActionIcon>
                                </Tooltip>
                            )}
                        </Group>
                    </Group>
                    <Box fz="sm" mb="xs">
                        <Text>{reply.text}</Text>
                    </Box>
                </Grid.Col>
            </Grid>
        </Box>
    );
};
