import { Comment } from '@lightdash/common';
import {
    ActionIcon,
    Avatar,
    Box,
    Button,
    Collapse,
    Divider,
    Grid,
    Group,
    Loader,
    LoadingOverlay,
    Popover,
    PopoverProps,
    Stack,
    Text,
    TextInput,
    Tooltip,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { useDisclosure, useHover } from '@mantine/hooks';
import {
    IconCircleCheck,
    IconMessage,
    IconMessageReply,
    IconTrash,
} from '@tabler/icons-react';
import moment from 'moment';
import { FC, useCallback, useState } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { useTimeAgo } from '../../../hooks/useTimeAgo';
import {
    useCreateComment,
    useGetComments,
    useRemoveComment,
    useResolveComment,
} from '../hooks/useComments';

type Props = {
    projectUuid: string;
    dashboardUuid: string;
    dashboardTileUuid: string;
};

const getNameInitials = (name: string) => {
    return name
        .split(' ')
        .map((n) => n[0])
        .join('');
};

const CommentTimestamp: FC<{ commentTimestamp: Date }> = ({
    commentTimestamp,
}) => {
    const timeAgo = useTimeAgo(commentTimestamp);

    return (
        <Tooltip
            position="top-start"
            label={moment(commentTimestamp).format('YYYY-MM-DD HH:mm:ss')}
        >
            <Text fz="xs" color="gray.5">
                {timeAgo}
            </Text>
        </Tooltip>
    );
};

const Reply: FC<{ reply: Comment } & Props> = ({
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
                            <CommentTimestamp
                                commentTimestamp={reply.createdAt}
                            />
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

const CommentDetail: FC<{ comment: Comment } & Props> = ({
    comment,
    projectUuid,
    dashboardTileUuid,
    dashboardUuid,
}) => {
    const [isRepliesOpen, { toggle: toggleReplies }] = useDisclosure(false);
    const { ref, hovered } = useHover();
    const [isReplyingTo, setIsReplyingTo] = useState<string | undefined>(
        undefined,
    );
    const [replyText, setReplyText] = useState('');
    const { mutateAsync: createReply, isLoading: isCreatingReply } =
        useCreateComment();
    const { mutateAsync: resolveComment, isLoading: isResolvingComment } =
        useResolveComment();
    const { mutateAsync: removeComment } = useRemoveComment();

    const handleReply = useCallback(async () => {
        await createReply({
            projectUuid,
            dashboardUuid,
            dashboardTileUuid,
            text: replyText,
            replyTo: comment.commentId,
        });
        setIsReplyingTo(undefined);
        setReplyText('');
    }, [
        dashboardTileUuid,
        dashboardUuid,
        createReply,
        projectUuid,
        replyText,
        comment,
    ]);

    const handleResolve = useCallback(
        async (commentId: string) => {
            await resolveComment({
                dashboardUuid,
                dashboardTileUuid,
                commentId,
            });
        },
        [dashboardTileUuid, dashboardUuid, resolveComment],
    );

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
        <Stack spacing="two">
            <LoadingOverlay visible={isResolvingComment} />
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
                                <Text fz="sm" fw={500}>
                                    {comment.user.name}
                                </Text>
                                <CommentTimestamp
                                    commentTimestamp={comment.createdAt}
                                />
                            </Group>
                            <Group spacing="two">
                                {comment.canRemove && (
                                    <Tooltip label="Remove">
                                        <ActionIcon
                                            size="xs"
                                            opacity={hovered ? 1 : 0}
                                            onClick={() =>
                                                handleRemove(comment.commentId)
                                            }
                                            variant="light"
                                            color="gray"
                                        >
                                            <MantineIcon icon={IconTrash} />
                                        </ActionIcon>
                                    </Tooltip>
                                )}
                                <Tooltip label="Reply">
                                    <ActionIcon
                                        size="xs"
                                        opacity={hovered ? 1 : 0}
                                        onClick={() => {
                                            setIsReplyingTo((prev) =>
                                                prev === comment.commentId
                                                    ? undefined
                                                    : comment.commentId,
                                            );
                                            if (!isRepliesOpen) {
                                                toggleReplies();
                                            }
                                        }}
                                        variant="light"
                                        color="blue"
                                    >
                                        <MantineIcon icon={IconMessageReply} />
                                    </ActionIcon>
                                </Tooltip>
                                <Tooltip label="Resolve">
                                    <ActionIcon
                                        size="xs"
                                        opacity={hovered ? 1 : 0}
                                        onClick={() =>
                                            handleResolve(comment.commentId)
                                        }
                                        variant="light"
                                        color="green"
                                    >
                                        <MantineIcon icon={IconCircleCheck} />
                                    </ActionIcon>
                                </Tooltip>
                            </Group>
                        </Group>
                        <Box fz="sm" mb="xs">
                            <Text>{comment.text}</Text>
                        </Box>
                    </Grid.Col>
                </Grid>
            </Box>
            {comment.replies && comment.replies.length > 0 && (
                <Box ml="xl">
                    <Divider
                        size="xs"
                        labelPosition="right"
                        label={
                            <Button
                                compact
                                size="xs"
                                variant="subtle"
                                fz="xs"
                                onClick={toggleReplies}
                            >
                                {comment.replies.length}{' '}
                                {comment.replies.length === 1
                                    ? 'reply'
                                    : 'replies'}
                            </Button>
                        }
                    />

                    <Collapse in={isRepliesOpen}>
                        <Stack spacing="xs">
                            {comment.replies.map((reply) => (
                                <Reply
                                    key={reply.commentId}
                                    reply={reply}
                                    projectUuid={projectUuid}
                                    dashboardUuid={dashboardUuid}
                                    dashboardTileUuid={dashboardTileUuid}
                                />
                            ))}
                        </Stack>
                    </Collapse>
                </Box>
            )}

            {(isReplyingTo || isRepliesOpen) && (
                <Stack spacing="xs" ml="lg" mb="sm">
                    <TextInput
                        placeholder="Type your reply here..."
                        size="xs"
                        radius="sm"
                        value={replyText}
                        onChange={(e) => setReplyText(e.currentTarget.value)}
                    />
                    <Button
                        size="xs"
                        variant="default"
                        disabled={replyText === ''}
                        sx={{
                            alignSelf: 'flex-end',
                        }}
                        onClick={handleReply}
                        loading={isCreatingReply}
                    >
                        Reply
                    </Button>
                </Stack>
            )}
        </Stack>
    );
};

export const DashboardTileComments: FC<
    Props &
        Pick<PopoverProps, 'opened' | 'onClose' | 'onOpen'> & {
            visible: boolean;
        }
> = ({
    projectUuid,
    dashboardTileUuid,
    dashboardUuid,
    opened,
    onClose,
    onOpen,
    visible,
}) => {
    const commentForm = useForm<Pick<Comment, 'text' | 'replyTo'>>({
        initialValues: {
            text: '',
            replyTo: '',
        },
    });
    const { data: comments, isRefetching } = useGetComments(
        dashboardUuid,
        dashboardTileUuid,
    );
    const { mutateAsync, isLoading } = useCreateComment();

    const handleSubmit = commentForm.onSubmit(async ({ text }) => {
        await mutateAsync({
            projectUuid,
            dashboardUuid,
            dashboardTileUuid,
            text,
        });

        commentForm.reset();
    });

    return (
        <Popover
            withArrow
            withinPortal
            shadow="md"
            position="bottom-end"
            offset={4}
            arrowOffset={10}
            opened={opened}
            onOpen={() => {
                onOpen?.();

                // TODO: markDashboardCommentNotificationAsRead();

                commentForm.reset();
            }}
            onClose={() => {
                commentForm.reset();
                onClose?.();
            }}
        >
            <Popover.Dropdown miw={400}>
                <Stack spacing="xs">
                    {comments?.map((comment) => {
                        return (
                            <CommentDetail
                                key={comment.commentId}
                                comment={comment}
                                projectUuid={projectUuid}
                                dashboardUuid={dashboardUuid}
                                dashboardTileUuid={dashboardTileUuid}
                            />
                        );
                    })}
                </Stack>

                <form onSubmit={handleSubmit}>
                    <Stack spacing="xs" mt="xs">
                        <TextInput
                            placeholder="Type your comment here..."
                            size="xs"
                            radius="sm"
                            {...commentForm.getInputProps('text')}
                        />

                        <Button
                            loading={isLoading}
                            disabled={commentForm.values.text === ''}
                            variant="default"
                            size="xs"
                            sx={{
                                alignSelf: 'flex-end',
                            }}
                            type="submit"
                        >
                            Add comment
                        </Button>
                    </Stack>
                </form>
            </Popover.Dropdown>

            <Popover.Target>
                <ActionIcon
                    sx={{
                        visibility: visible ? 'visible' : 'hidden',
                    }}
                    size="sm"
                    onClick={() => onOpen?.()}
                >
                    {isRefetching ? (
                        <Loader size="xs" />
                    ) : (
                        <MantineIcon icon={IconMessage} />
                    )}
                </ActionIcon>
            </Popover.Target>
        </Popover>
    );
};
