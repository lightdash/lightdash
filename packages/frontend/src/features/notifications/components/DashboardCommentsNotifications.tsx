import { Notification } from '@lightdash/common';
import { Menu, useMantineTheme } from '@mantine/core';
import { IconCircleFilled } from '@tabler/icons-react';
import { FC, useCallback } from 'react';
import { useHistory } from 'react-router-dom';
import MantineIcon from '../../../components/common/MantineIcon';
import { useUpdateNotification } from '../hooks/useNotifications';

type Props = {
    projectUuid: string;
    notifications: Notification[] | undefined;
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
            {!!notifications?.length
                ? notifications.map((notification) => (
                      <Menu.Item
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
                          onClick={() =>
                              handleOnNotificationClick(notification)
                          }
                          fz="xs"
                      >
                          {notification.message}
                      </Menu.Item>
                  ))
                : null}
        </>
    );
};
