import { type Comment } from '@lightdash/common';
import { Box, Button, Collapse, Divider, Stack } from '@mantine-8/core';
import { useDisclosure } from '@mantine/hooks';
import { useCallback, useState, type FC } from 'react';
import useApp from '../../../providers/App/useApp';
import useDashboardContext from '../../../providers/Dashboard/useDashboardContext';
import {
    useCreateComment,
    useRemoveComment,
    useResolveComment,
} from '../hooks/useComments';
import { CommentDetail } from './CommentDetail';
import { CommentForm } from './CommentForm';

type Props = {
    projectUuid: string;
    dashboardUuid: string;
    dashboardTileUuid: string;
    comment: Comment;
    targetRef: React.RefObject<HTMLDivElement | null> | null;
    isResolved?: boolean;
};

export const DashboardCommentAndReplies: FC<Props> = ({
    comment,
    projectUuid,
    dashboardTileUuid,
    dashboardUuid,
    targetRef,
    isResolved = false,
}) => {
    const { user } = useApp();
    const canCreateDashboardComments = !!useDashboardContext(
        (c) => c.dashboardCommentsCheck?.canCreateDashboardComments,
    );
    const canManageDashboardComments = !!useDashboardContext(
        (c) => c.dashboardCommentsCheck?.canManageDashboardComments,
    );

    const [isRepliesOpen, { toggle: toggleReplies }] = useDisclosure(false);
    const [isReplyingTo, setIsReplyingTo] = useState<string | undefined>(
        undefined,
    );

    const { mutateAsync: createReply, isLoading: isCreatingReply } =
        useCreateComment();
    const { mutateAsync: removeComment } = useRemoveComment();
    const { mutateAsync: resolveComment } = useResolveComment();

    const handleRemove = useCallback(
        async (commentId: string) => {
            await removeComment({
                dashboardUuid,
                commentId,
            });
        },
        [dashboardUuid, removeComment],
    );

    const handleResolve = useCallback(
        async (commentId: string) => {
            await resolveComment({
                dashboardUuid,
                commentId,
                resolved: true,
            });
        },
        [dashboardUuid, resolveComment],
    );

    const handleUnresolve = useCallback(
        async (commentId: string) => {
            await resolveComment({
                dashboardUuid,
                commentId,
                resolved: false,
            });
        },
        [dashboardUuid, resolveComment],
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
        <Stack gap="two" ref={targetRef}>
            <CommentDetail
                comment={comment}
                canReply={!isResolved && canCreateDashboardComments}
                onReply={() => handleReply()}
                // can remove any comment or the comment is created by the current user
                canRemove={comment.canRemove}
                onRemove={() => handleRemove(comment.commentId)}
                // resolving/unresolving the parent applies to the whole thread
                canResolve={!isResolved && canManageDashboardComments}
                onResolve={() => handleResolve(comment.commentId)}
                canUnresolve={isResolved && canManageDashboardComments}
                onUnresolve={() => handleUnresolve(comment.commentId)}
            />

            {comment.replies && comment.replies.length > 0 && (
                <Box ml="xl">
                    <Divider
                        size="xs"
                        labelPosition="right"
                        label={
                            <Button
                                size="compact-xs"
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
                        <Stack gap="xs">
                            {comment.replies.map((reply) => (
                                <CommentDetail
                                    key={reply.commentId}
                                    comment={reply}
                                    // Can't reply to a reply
                                    canReply={false}
                                    // can remove any comment or the comment is created by the current user
                                    canRemove={reply.canRemove}
                                    onRemove={() =>
                                        handleRemove(reply.commentId)
                                    }
                                    // replies are resolved/unresolved together with the parent
                                    canResolve={false}
                                    canUnresolve={false}
                                />
                            ))}
                        </Stack>
                    </Collapse>
                </Box>
            )}

            <Collapse in={!isResolved && !!isReplyingTo} ml="lg">
                <CommentForm
                    userName={user.data?.firstName + ' ' + user.data?.lastName}
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
            </Collapse>
        </Stack>
    );
};
