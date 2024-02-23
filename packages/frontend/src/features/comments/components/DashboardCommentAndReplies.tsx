import { Comment } from '@lightdash/common';
import { Box, Button, Collapse, Divider, Stack } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { FC, useCallback, useState } from 'react';
import { useApp } from '../../../providers/AppProvider';
import { useCreateComment, useRemoveComment } from '../hooks/useComments';
import { CommentDetail } from './CommentDetail';
import { CommentForm } from './CommentForm';

type Props = {
    projectUuid: string;
    dashboardUuid: string;
    dashboardTileUuid: string;
    comment: Comment;
};

export const DashboardCommentAndReplies: FC<Props> = ({
    comment,
    projectUuid,
    dashboardTileUuid,
    dashboardUuid,
}) => {
    const { user } = useApp();
    const [isRepliesOpen, { toggle: toggleReplies }] = useDisclosure(false);

    const [isReplyingTo, setIsReplyingTo] = useState<string | undefined>(
        undefined,
    );
    const { mutateAsync: createReply, isLoading: isCreatingReply } =
        useCreateComment();
    const { mutateAsync: removeComment } = useRemoveComment();

    const handleRemove = useCallback(
        async (commentId: string) => {
            await removeComment({
                dashboardUuid,
                commentId,
            });
        },
        [dashboardUuid, removeComment],
    );

    return (
        <Stack spacing="two">
            <CommentDetail
                comment={comment}
                onRemove={() => handleRemove(comment.commentId)}
                onReply={() => {
                    {
                        setIsReplyingTo((prev) =>
                            prev === comment.commentId
                                ? undefined
                                : comment.commentId,
                        );
                        if (!isRepliesOpen) {
                            toggleReplies();
                        }
                    }
                }}
            />

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
                                <CommentDetail
                                    key={reply.commentId}
                                    comment={reply}
                                    onRemove={() =>
                                        handleRemove(reply.commentId)
                                    }
                                />
                            ))}
                        </Stack>
                    </Collapse>
                </Box>
            )}

            {(isReplyingTo || isRepliesOpen) && (
                <Box ml="xl">
                    <CommentForm
                        userName={
                            user.data?.firstName + ' ' + user.data?.lastName
                        }
                        onSubmit={(text: string, mentions: string[]) =>
                            createReply({
                                projectUuid,
                                dashboardUuid,
                                dashboardTileUuid,
                                text,
                                replyTo: comment.commentId,
                                mentions,
                            })
                        }
                        onCancel={() => {
                            toggleReplies();
                            setIsReplyingTo(undefined);
                        }}
                        isSubmitting={isCreatingReply}
                        mode="reply"
                    />
                </Box>
            )}
        </Stack>
    );
};
