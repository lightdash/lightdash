import {
    ActionIcon,
    Box,
    Divider,
    Popover,
    PopoverProps,
    Stack,
    Text,
} from '@mantine/core';
import { useScrollIntoView } from '@mantine/hooks';
import { IconMessage } from '@tabler/icons-react';
import { FC, useCallback } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { useApp } from '../../../providers/AppProvider';
import { useDashboardContext } from '../../../providers/DashboardProvider';
import { useTracking } from '../../../providers/TrackingProvider';
import { EventName } from '../../../types/Events';
import { useCreateComment } from '../hooks/useComments';
import { CommentForm } from './CommentForm';
import { DashboardCommentAndReplies } from './DashboardCommentAndReplies';

type Props = {
    dashboardTileUuid: string;
};

const COMMENTS_LIST_MAX_HEIGHT = 500;

export const DashboardTileComments: FC<
    Props & Pick<PopoverProps, 'opened' | 'onClose' | 'onOpen'>
> = ({ dashboardTileUuid, opened, onClose, onOpen }) => {
    const { user } = useApp();
    const { track } = useTracking();

    const projectUuid = useDashboardContext((c) => c.projectUuid);
    const dashboardUuid = useDashboardContext((c) => c.dashboard?.uuid);
    const userCanManageDashboardComments = useDashboardContext(
        (c) => c.dashboardCommentsCheck?.userCanManageDashboardComments,
    );
    const comments = useDashboardContext(
        (c) => c.dashboardComments && c.dashboardComments[dashboardTileUuid],
    );

    // Scroll to the last comment when a new comment is added
    const { scrollIntoView, targetRef, scrollableRef } =
        useScrollIntoView<HTMLDivElement>({
            duration: 200,
            offset: COMMENTS_LIST_MAX_HEIGHT, // Ensures the last comment is always visible
        });

    const { mutateAsync, isLoading } = useCreateComment();
    const handleOnSubmit = useCallback(
        async (text: string, textHtml: string, mentions: string[]) => {
            if (!projectUuid || !dashboardUuid) return;

            const result = await mutateAsync({
                projectUuid,
                dashboardUuid,
                dashboardTileUuid,
                text,
                textHtml,
                mentions,
            });

            // Scroll to the bottom of the comments stack
            scrollIntoView({ alignment: 'end' });

            return result;
        },
        [
            mutateAsync,
            projectUuid,
            dashboardUuid,
            dashboardTileUuid,
            scrollIntoView,
        ],
    );

    if (!projectUuid || !dashboardUuid) {
        return null;
    }

    const hasComments = comments && comments.length === 0;

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
                track({
                    name: EventName.COMMENTS_CLICKED,
                    properties: {
                        dashboardUuid,
                        dashboardTileUuid,
                    },
                });

                onOpen?.();
            }}
            onClose={() => {
                onClose?.();
            }}
        >
            <Popover.Dropdown p={0} w={400}>
                <Stack
                    id="comments-stack"
                    ref={scrollableRef}
                    p="sm"
                    spacing="xs"
                    sx={{
                        maxHeight: COMMENTS_LIST_MAX_HEIGHT,
                        overflowY: 'auto',
                    }}
                >
                    {comments?.map((comment, index) => (
                        <DashboardCommentAndReplies
                            key={comment.commentId}
                            comment={comment}
                            projectUuid={projectUuid}
                            dashboardUuid={dashboardUuid}
                            dashboardTileUuid={dashboardTileUuid}
                            targetRef={
                                // Assign the target ref to the last comment
                                index === comments.length - 1 ? targetRef : null
                            }
                        />
                    ))}
                    {!userCanManageDashboardComments && !hasComments && (
                        <Text fz="xs">No comments yet</Text>
                    )}
                </Stack>

                {hasComments && <Divider />}
                <Box p="sm" pt="xs">
                    {userCanManageDashboardComments && (
                        <CommentForm
                            userName={
                                user.data?.firstName + ' ' + user.data?.lastName
                            }
                            onSubmit={handleOnSubmit}
                            isSubmitting={isLoading}
                        />
                    )}
                </Box>
            </Popover.Dropdown>

            <Popover.Target>
                <ActionIcon
                    size="sm"
                    onClick={() => (opened ? onClose?.() : onOpen?.())}
                >
                    <MantineIcon icon={IconMessage} />
                </ActionIcon>
            </Popover.Target>
        </Popover>
    );
};
