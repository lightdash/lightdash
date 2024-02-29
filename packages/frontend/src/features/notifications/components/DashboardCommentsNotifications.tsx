import { Notification } from '@lightdash/common';
import { Menu, Text, Tooltip, useMantineTheme } from '@mantine/core';
import { IconCircleFilled } from '@tabler/icons-react';
import moment from 'moment';
import { FC, useCallback } from 'react';
import { useHistory } from 'react-router-dom';
import MantineIcon from '../../../components/common/MantineIcon';
import { useTimeAgo } from '../../../hooks/useTimeAgo';
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
            offset={-2}
            label={
                <Text fz="xs">
                    {moment(createdAt).format('YYYY-MM-DD HH:mm:ss')}
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

            history.push(`/projects/${projectUuid}${notification.url}`);
        },
        [history, projectUuid, updateNotification],
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
