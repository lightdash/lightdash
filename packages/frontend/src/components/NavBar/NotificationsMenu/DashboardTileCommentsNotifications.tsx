import { Notification } from '@lightdash/common';
import { Anchor, Divider, Menu, Text, useMantineTheme } from '@mantine/core';
import { IconCircleFilled } from '@tabler/icons-react';
import { FC } from 'react';
import { useHistory } from 'react-router-dom';
import { useMarkDashboardCommentNotificationAsRead } from '../../../features/dashboardTilecomments/hooks/useComments';
import MantineIcon from '../../common/MantineIcon';

type Props = {
    projectUuid: string;
    notifications: Notification[] | undefined;
};

export const DashboardTileCommentsNotifications: FC<Props> = ({
    projectUuid,
    notifications,
}) => {
    const theme = useMantineTheme();
    const history = useHistory();
    const { mutate: markDashboardCommentNotificationAsRead } =
        useMarkDashboardCommentNotificationAsRead();
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
                          onClick={() => {
                              markDashboardCommentNotificationAsRead(
                                  notification.notificationId,
                              );
                              history.push(
                                  `/projects/${projectUuid}/dashboards/${notification.dashboard?.uuid}?dashboardTileUuid=${notification.dashboard?.tileUuid}`,
                              );
                          }}
                          fz="xs"
                      >
                          <Text fw={500}>{notification.author.name}</Text>
                          commented on{' '}
                          <Anchor
                              href={`/projects/${projectUuid}/dashboards/${notification.dashboard?.uuid}`}
                          >
                              {notification.dashboard?.name}
                          </Anchor>
                          <Divider mt="xs" />
                      </Menu.Item>
                  ))
                : null}
        </>
    );
};
