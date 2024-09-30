import { sanitizeHtml, type Comment } from '@lightdash/common';
import {
    ActionIcon,
    Avatar,
    Box,
    Grid,
    Group,
    Menu,
    Text,
    Tooltip,
} from '@mantine/core';
import { useHover } from '@mantine/hooks';
import { IconDotsVertical, IconMessage, IconTrash } from '@tabler/icons-react';
import { useMemo, type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { getNameInitials } from '../utils';
import { CommentTimestamp } from './CommentTimestamp';

type Props = {
    comment: Comment;
    canRemove: boolean;
    canReply: boolean;
    onRemove: () => void;
    onReply?: () => void;
};

export const CommentDetail: FC<Props> = ({
    comment,
    canRemove,
    onRemove,
    canReply,
    onReply,
}) => {
    const { ref, hovered } = useHover();

    /**
     * Content should already be sanitized from the API, but as an extra
     * precaution we also sanitize it before rendering.
     */
    const sanitizedCommentTextHtml = useMemo(
        () => sanitizeHtml(comment.textHtml),
        [comment.textHtml],
    );

    return (
        <Box ref={ref}>
            <Grid columns={20}>
                <Grid.Col span={2}>
                    <Avatar radius="xl" size="sm">
                        {getNameInitials(comment.user.name)}
                    </Avatar>
                </Grid.Col>
                <Grid.Col span={18}>
                    <Group position="apart">
                        <Group spacing="xs">
                            <Text fz="xs" fw={600}>
                                {comment.user.name}
                            </Text>
                            <CommentTimestamp timestamp={comment.createdAt} />
                        </Group>

                        <Group spacing="two" opacity={hovered ? 1 : 0}>
                            {canReply && onReply && (
                                <Tooltip label="Reply">
                                    <ActionIcon
                                        size="xs"
                                        onClick={() => onReply()}
                                        variant="subtle"
                                        color="blue"
                                    >
                                        <MantineIcon icon={IconMessage} />
                                    </ActionIcon>
                                </Tooltip>
                            )}
                            {canRemove && (
                                <Menu position="right" withArrow>
                                    <Menu.Target>
                                        <ActionIcon
                                            size="xs"
                                            variant="subtle"
                                            color="gray"
                                        >
                                            <MantineIcon
                                                icon={IconDotsVertical}
                                            />
                                        </ActionIcon>
                                    </Menu.Target>
                                    <Menu.Dropdown p={0}>
                                        <Menu.Item
                                            p="xs"
                                            fz="xs"
                                            icon={
                                                <MantineIcon
                                                    color="red"
                                                    icon={IconTrash}
                                                />
                                            }
                                            onClick={() => onRemove()}
                                        >
                                            Delete
                                        </Menu.Item>
                                    </Menu.Dropdown>
                                </Menu>
                            )}
                        </Group>
                    </Group>
                    <Box
                        dangerouslySetInnerHTML={{
                            __html: sanitizedCommentTextHtml,
                        }}
                        fz="xs"
                        sx={{
                            wordBreak: 'break-word',
                        }}
                    />
                </Grid.Col>
            </Grid>
        </Box>
    );
};
