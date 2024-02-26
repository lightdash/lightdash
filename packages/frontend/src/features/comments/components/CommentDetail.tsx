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
import { IconMessage, IconTrash } from '@tabler/icons-react';
import { FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { getNameInitials } from '../utils';
import { CommentTimestamp } from './CommentTimestamp';
import { CommentWithMentions } from './CommentWithMentions';

type Props = {
    comment: Comment;
    onRemove: () => void;
    onReply?: () => void;
};

export const CommentDetail: FC<Props> = ({ comment, onRemove, onReply }) => {
    const { ref, hovered } = useHover();

    return (
        <Box ref={ref}>
            <Grid columns={24}>
                <Grid.Col span={2}>
                    <Avatar radius="xl" size="sm">
                        {getNameInitials(comment.user.name)}
                    </Avatar>
                </Grid.Col>
                <Grid.Col span={22}>
                    <Group position="apart">
                        <Group spacing="xs">
                            <Text fz="xs" fw={500}>
                                {comment.user.name}
                            </Text>
                            <CommentTimestamp timestamp={comment.createdAt} />
                        </Group>

                        <Group spacing="two" opacity={hovered ? 1 : 0}>
                            {comment.canRemove && (
                                <Tooltip label="Remove">
                                    <ActionIcon
                                        size="xs"
                                        onClick={() => onRemove()}
                                        variant="light"
                                        color="gray"
                                    >
                                        <MantineIcon icon={IconTrash} />
                                    </ActionIcon>
                                </Tooltip>
                            )}
                            {onReply && (
                                <Tooltip label="Reply">
                                    <ActionIcon
                                        size="xs"
                                        onClick={() => onReply()}
                                        variant="light"
                                        color="blue"
                                    >
                                        <MantineIcon icon={IconMessage} />
                                    </ActionIcon>
                                </Tooltip>
                            )}
                        </Group>
                    </Group>
                    <Box fz="xs" mb="xs">
                        <CommentWithMentions readonly content={comment.text} />
                    </Box>
                </Grid.Col>
            </Grid>
        </Box>
    );
};
