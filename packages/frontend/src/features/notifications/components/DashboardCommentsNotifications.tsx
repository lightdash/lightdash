import { type Notification } from '@lightdash/common';
import { Menu, Text, Tooltip, useMantineTheme } from '@mantine/core';
import { IconCircleFilled } from '@tabler/icons-react';
import dayjs from 'dayjs';
import { useCallback, type FC } from 'react';
import { useHistory } from 'react-router-dom';
import MantineIcon from '../../../components/common/MantineIcon';
import { useTimeAgo } from '../../../hooks/useTimeAgo';
import { useTracking } from '../../../providers/TrackingProvider';
import { EventName } from '../../../types/Events';
import { useUpdateNotification } from '../hooks/useNotifications';

type Props = {
    projectUuid: string;
    notifications: Notification[];
};

const NotificationTime: FC<{ createdAt: Date }> = ({ createdAt }) => {
    const date = useTimeAgo(createdAt);
    return (
        <Tooltip
            position="top-end"
            // Add offset so toolip pointer is closer to the text
            offset={-2}
            label={
                <Text fz="xs">
                    {dayjs(createdAt).format('YYYY-MM-DD HH:mm:ss')}
                </Text>
            }
        >
            <Text ta="right" mb="one" fw={500} color="gray.5">
                {date}
            </Text>
        </Tooltip>
    );
};

export const DashboardCommentsNotifications: FC<Props> = ({
    projectUuid,
    notifications,
}) => {
    const { track } = useTracking();
    const theme = useMantineTheme();
    const history = useHistory();
    const { mutateAsync: updateNotification } = useUpdateNotification();

    const handleOnNotificationClick = useCallback(
        async (notification: Notification) => {
            await updateNotification({
                notificationId: notification.notificationId,
                resourceType: notification.resourceType,
                toUpdate: {
                    viewed: true,
                },
            });

            track({
                name: EventName.NOTIFICATIONS_COMMENTS_ITEM_CLICKED,
                properties: {
                    hasMention: true, // TODO: At the moment, comments' notifications are always mentions
                    dashboardUuid: notification.metadata?.dashboardUuid,
                    dashboardTileUuid: notification.metadata?.dashboardTileUuid,
                },
            });

            history.push(
                `/projects/${projectUuid}${notification.url}${
                    notification.metadata?.dashboardTileUuid
                        ? `?tileUuid=${notification.metadata?.dashboardTileUuid}`
                        : ''
                }`,
            );
        },
        [history, projectUuid, track, updateNotification],
    );

    return (
        <>
            {notifications.map((notification) => (
                <Menu.Item
                    p="xs"
                    key={notification.notificationId}
                    icon={
                        <MantineIcon
                            size={10}
                            icon={IconCircleFilled}
                            style={{
                                color: notification.viewed
                                    ? 'transparent'
                                    : theme.colors.blue[4],
                            }}
                        />
                    }
                    onClick={() => handleOnNotificationClick(notification)}
                    fz="xs"
                >
                    <>
                        <NotificationTime createdAt={notification.createdAt} />
                        <Text c="gray.3">{notification.message} </Text>
                    </>
                </Menu.Item>
            ))}
        </>
    );
};
