import { Comment } from '@lightdash/common';
import {
    ActionIcon,
    Avatar,
    Box,
    Button,
    Collapse,
    Divider,
    Group,
    LoadingOverlay,
    Popover,
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
} from '@tabler/icons-react';
import { FC, useCallback, useState } from 'react';
import MantineIcon from '../common/MantineIcon';
import {
    useCreateComment,
    useGetComments,
    useResolveComment,
} from './useComments';

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

    const handleReply = useCallback(async () => {
        await createReply({
            projectUuid,
            dashboardUuid,
            dashboardTileUuid,
            text: replyText,
            replyTo: isReplyingTo,
        });
        setIsReplyingTo(undefined);
        setReplyText('');
    }, [
        dashboardTileUuid,
        dashboardUuid,
        isReplyingTo,
        createReply,
        projectUuid,
        replyText,
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

    return (
        <Stack spacing="two">
            <LoadingOverlay visible={isResolvingComment} />
            <Box ref={ref}>
                <Group spacing="xs">
                    <Avatar radius="xl" size="sm">
                        {getNameInitials(comment.user.name)}
                    </Avatar>
                    <Text fz="xs" fw={500}>
                        {comment.user.name}
                    </Text>

                    <Group spacing="one">
                        <Tooltip label="Reply">
                            <ActionIcon
                                opacity={hovered ? 1 : 0}
                                onClick={() =>
                                    setIsReplyingTo((prev) =>
                                        prev === comment.commentId
                                            ? undefined
                                            : comment.commentId,
                                    )
                                }
                            >
                                <MantineIcon
                                    color="blue.4"
                                    icon={IconMessageReply}
                                />
                            </ActionIcon>
                        </Tooltip>
                        <Tooltip label="Resolve">
                            <ActionIcon
                                opacity={hovered ? 1 : 0}
                                onClick={() => handleResolve(comment.commentId)}
                            >
                                <MantineIcon
                                    color="green.4"
                                    icon={IconCircleCheck}
                                />
                            </ActionIcon>
                        </Tooltip>
                    </Group>
                </Group>
                <Box fz="sm" mb="xs">
                    <Text>{comment.text}</Text>
                </Box>
            </Box>
            {comment.replies && comment.replies.length > 0 && (
                <Box ml="lg">
                    <Divider
                        labelPosition="center"
                        label={
                            <Button
                                size="xs"
                                variant="subtle"
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
                                <Box key={reply.commentId}>
                                    <Group spacing="xs">
                                        <Avatar radius="xl" size="sm">
                                            {getNameInitials(reply.user.name)}
                                        </Avatar>
                                        <Text fz="xs" fw={500}>
                                            {reply.user.name}
                                        </Text>
                                    </Group>
                                    <Box fz="sm" mb="xs">
                                        <Text>{reply.text}</Text>
                                    </Box>
                                </Box>
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

            <Divider color="gray.1" />
        </Stack>
    );
};

export const Comments: FC<Props> = ({
    projectUuid,
    dashboardTileUuid,
    dashboardUuid,
}) => {
    const commentForm = useForm<Pick<Comment, 'text' | 'replyTo'>>({
        initialValues: {
            text: '',
            replyTo: '',
        },
    });
    const { data: comments } = useGetComments(
        projectUuid,
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
            opened
            zIndex={10000}
            width={500}
        >
            <Popover.Dropdown onMouseOver={(e) => e.stopPropagation()}>
                {/* Add comments list */}

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
                <ActionIcon size="sm" onMouseOver={(e) => e.stopPropagation()}>
                    <MantineIcon icon={IconMessage} />
                </ActionIcon>
            </Popover.Target>
        </Popover>
    );
};
