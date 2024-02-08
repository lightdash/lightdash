import { Notification } from '@lightdash/common';
import { Anchor, Menu } from '@mantine/core';
import { IconMessage2Exclamation } from '@tabler/icons-react';
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
    const history = useHistory();
    const { mutate: markDashboardCommentNotificationAsRead } =
        useMarkDashboardCommentNotificationAsRead();
    return (
        !!notifications?.length &&
        notifications.map((notification) => (
            <Menu.Item
                key={notification.notificationId}
                icon={<MantineIcon icon={IconMessage2Exclamation} />}
                onClick={() => {
                    markDashboardCommentNotificationAsRead(
                        notification.notificationId,
                    );
                    history.push(
                        `/projects/${projectUuid}/dashboards/${notification.dashboard?.uuid}`,
                    );
                }}
            >
                {notification.author.name} commented on{' '}
                <Anchor
                    href={`/projects/${projectUuid}/dashboards/${notification.dashboard?.uuid}`}
                >
                    {notification.dashboard?.name}
                </Anchor>
            </Menu.Item>
        ))
    );
};
