import { NotificationResourceType } from '@lightdash/common';
import {
    ActionIcon,
    Indicator,
    Popover,
    PopoverProps,
    Stack,
    Text,
} from '@mantine/core';
import { IconMessage } from '@tabler/icons-react';
import { FC, useCallback, useMemo } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { useApp } from '../../../providers/AppProvider';
import { useDashboardContext } from '../../../providers/DashboardProvider';
import { useTracking } from '../../../providers/TrackingProvider';
import { EventName } from '../../../types/Events';
import { useGetNotifications } from '../../notifications';
import { useUpdateNotification } from '../../notifications/hooks/useNotifications';
import { useCreateComment } from '../hooks/useComments';
import { CommentForm } from './CommentForm';
import { DashboardCommentAndReplies } from './DashboardCommentAndReplies';

type Props = {
    dashboardTileUuid: string;
};

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

    const { mutateAsync, isLoading } = useCreateComment();

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

    return (
        <Popover
            withArrow
            withinPortal
            shadow="md"
            position="bottom-end"
            offset={4}
            arrowOffset={10}
            opened={opened}
            onOpen={handleOnOpen}
            onClose={() => {
                onClose?.();
            }}
        >
            <Popover.Dropdown miw={400}>
                <Stack
                    spacing="xs"
                    sx={{
                        maxHeight: 300,
                        overflowY: 'auto',
                    }}
                >
                    {comments?.map((comment) => (
                        <DashboardCommentAndReplies
                            key={comment.commentId}
                            comment={comment}
                            projectUuid={projectUuid}
                            dashboardUuid={dashboardUuid}
                            dashboardTileUuid={dashboardTileUuid}
                        />
                    ))}
                    {!userCanManageDashboardComments &&
                        (!comments || comments.length === 0) && (
                            <Text fz="xs">No comments yet</Text>
                        )}
                </Stack>
                {userCanManageDashboardComments && (
                    <CommentForm
                        userName={
                            user.data?.firstName + ' ' + user.data?.lastName
                        }
                        onSubmit={(
                            text: string,
                            textHtml: string,
                            mentions: string[],
                        ) =>
                            mutateAsync({
                                projectUuid,
                                dashboardUuid,
                                dashboardTileUuid,
                                text,
                                textHtml,
                                mentions,
                            })
                        }
                        isSubmitting={isLoading}
                    />
                )}
            </Popover.Dropdown>

            <Popover.Target>
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
                        onClick={() => (opened ? onClose?.() : onOpen?.())}
                    >
                        <MantineIcon icon={IconMessage} />
                    </ActionIcon>
                </Indicator>
            </Popover.Target>
        </Popover>
    );
};
