import { Comment } from '@lightdash/common';
import { Box, Button, Collapse, Divider, Stack } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { FC, useCallback, useState } from 'react';
import { useApp } from '../../../providers/AppProvider';
import { useDashboardContext } from '../../../providers/DashboardProvider';
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
    const userCanManageDashboardComments = !!useDashboardContext(
        (c) => c.dashboardCommentsCheck?.userCanManageDashboardComments,
    );

    const [isRepliesOpen, { toggle: toggleReplies }] = useDisclosure(false);
    const [isReplyingTo, setIsReplyingTo] = useState<string | undefined>(
        undefined,
    );
    const canReply =
        userCanManageDashboardComments && (isReplyingTo || isRepliesOpen);

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

    const handleReply = useCallback(() => {
        setIsReplyingTo((prev) =>
            prev === comment.commentId ? undefined : comment.commentId,
        );
        if (!isRepliesOpen) {
            toggleReplies();
        }
    }, [isRepliesOpen, comment.commentId, toggleReplies]);

    return (
        <Stack spacing="two">
            <CommentDetail
                comment={comment}
                canReply={userCanManageDashboardComments}
                onReply={() => handleReply()}
                canRemove={comment.canRemove}
                onRemove={() => handleRemove(comment.commentId)}
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
                                    canReply={false}
                                    canRemove={reply.canRemove}
                                    onRemove={() =>
                                        handleRemove(reply.commentId)
                                    }
                                />
                            ))}
                        </Stack>
                    </Collapse>
                </Box>
            )}

            {canReply && (
                <Box ml="xl">
                    <CommentForm
                        userName={
                            user.data?.firstName + ' ' + user.data?.lastName
                        }
                        onSubmit={(
                            text: string,
                            textHtml: string,
                            mentions: string[],
                        ) =>
                            createReply({
                                projectUuid,
                                dashboardUuid,
                                dashboardTileUuid,
                                text,
                                textHtml,
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
