import { NotificationResourceType } from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Divider,
    Indicator,
    Popover,
    Stack,
    Text,
    type PopoverProps,
} from '@mantine/core';
import { useScrollIntoView } from '@mantine/hooks';
import { IconMessage } from '@tabler/icons-react';
import { useCallback, useMemo, useRef, useState, type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { useApp } from '../../../providers/AppProvider';
import { useDashboardContext } from '../../../providers/DashboardProvider';
import { useTracking } from '../../../providers/TrackingProvider';
import { EventName } from '../../../types/Events';
import { useGetNotifications } from '../../notifications';
import { useUpdateNotification } from '../../notifications/hooks/useNotifications';
import { useCreateComment } from '../hooks/useComments';
import { useScrollToDashboardCommentViaSearchParam } from '../hooks/useScrollToDashboardCommentViaSearchParam';
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

    const [openedComments, setOpenedComments] = useState(opened);

    const projectUuid = useDashboardContext((c) => c.projectUuid);
    const dashboardUuid = useDashboardContext((c) => c.dashboard?.uuid);
    const canCreateDashboardComments = useDashboardContext(
        (c) => c.dashboardCommentsCheck?.canCreateDashboardComments,
    );
    const dashboard = useDashboardContext((c) => c.dashboard);
    const comments = useDashboardContext(
        (c) => c.dashboardComments && c.dashboardComments[dashboardTileUuid],
    );

    const targetRefComments = useRef<HTMLDivElement>(null);

    useScrollToDashboardCommentViaSearchParam({
        ref: targetRefComments,
        dashboardTileUuid,
        enabled: !!(dashboard && comments),
        onScrolled: () => {
            setOpenedComments(true);
        },
    });

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

    const { data: notifications } = useGetNotifications(
        NotificationResourceType.DashboardComments,
        true,
    );
    const { mutate: updateNotification } = useUpdateNotification();

    // TODO: This is a temporary solution. We should probably have a separate endpoint for unread comments
    const unreadNotificationsForTile = useMemo(
        () =>
            notifications?.filter(
                (n) =>
                    !n.viewed &&
                    n.metadata?.dashboardTileUuid === dashboardTileUuid &&
                    n.metadata?.dashboardUuid === dashboardUuid,
            ),
        [notifications, dashboardTileUuid, dashboardUuid],
    );

    const showIndicator = comments && comments.length > 0;
    const indicatorColor = useMemo(() => {
        if (unreadNotificationsForTile && unreadNotificationsForTile.length > 0)
            return 'red';

        return 'gray';
    }, [unreadNotificationsForTile]);

    const handleOnOpen = useCallback(() => {
        track({
            name: EventName.COMMENTS_CLICKED,
            properties: {
                dashboardUuid,
                dashboardTileUuid,
            },
        });
        unreadNotificationsForTile?.forEach((n) => {
            // Don't await, we don't want to block the UI
            updateNotification({
                notificationId: n.notificationId,
                resourceType: NotificationResourceType.DashboardComments,
                toUpdate: {
                    viewed: true,
                },
            });
        });
        onOpen?.();
    }, [
        dashboardTileUuid,
        dashboardUuid,
        onOpen,
        track,
        unreadNotificationsForTile,
        updateNotification,
    ]);

    if (!projectUuid || !dashboardUuid) {
        return null;
    }

    const hasComments = comments && comments.length > 0;

    return (
        <Popover
            withArrow
            withinPortal
            shadow="md"
            position="bottom-end"
            offset={4}
            arrowOffset={10}
            opened={openedComments}
            onOpen={handleOnOpen}
            onClose={() => {
                onClose?.();
            }}
            closeOnClickOutside
            onChange={setOpenedComments}
        >
            <Popover.Dropdown p={0} w={400} maw={400}>
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
                    {!canCreateDashboardComments && !hasComments && (
                        <Text fz="xs">No comments yet</Text>
                    )}
                </Stack>
                {hasComments && <Divider />}
                <Box p="sm" pt="xs">
                    {canCreateDashboardComments && (
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

            <Popover.Target ref={targetRefComments}>
                <Indicator
                    label={comments && comments.length}
                    size={12}
                    disabled={!showIndicator}
                    offset={4}
                    color={indicatorColor}
                    styles={{
                        common: {
                            fontSize: 11,
                            padding: 0,
                        },
                    }}
                >
                    <ActionIcon
                        size="sm"
                        onClick={() => {
                            if (openedComments) {
                                onClose?.();
                            } else {
                                onOpen?.();
                            }

                            setOpenedComments((prev) => !prev);
                        }}
                    >
                        <MantineIcon icon={IconMessage} />
                    </ActionIcon>
                </Indicator>
            </Popover.Target>
        </Popover>
    );
};
