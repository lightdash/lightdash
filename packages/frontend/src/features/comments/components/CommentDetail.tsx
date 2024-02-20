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
    LoadingOverlay,
    Stack,
    Text,
    TextInput,
    Tooltip,
} from '@mantine/core';
import { useDisclosure, useHover } from '@mantine/hooks';
import { IconCircleCheck, IconMessage, IconTrash } from '@tabler/icons-react';
import { FC, useCallback, useState } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import {
    useCreateComment,
    useRemoveComment,
    useResolveComment,
} from '../hooks/useComments';
import { getNameInitials } from '../utils';
import { CommentReply } from './CommentReply';
import { CommentTimestamp } from './CommentTimestamp';

type Props = {
    projectUuid: string;
    dashboardUuid: string;
    dashboardTileUuid: string;
    comment: Comment;
};

export const CommentDetail: FC<Props> = ({
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
                                    timestamp={comment.createdAt}
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
                                        <MantineIcon icon={IconMessage} />
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
                                <CommentReply
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
                        placeholder="Reply here..."
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
