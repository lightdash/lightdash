import { type NotificationAiReview } from '@lightdash/common';
import { Box, Menu } from '@mantine-8/core';
import { Text, Tooltip, useMantineTheme } from '@mantine/core';
import { IconCircleFilled } from '@tabler/icons-react';
import dayjs from 'dayjs';
import { useCallback, type FC } from 'react';
import { useNavigate } from 'react-router';
import MantineIcon from '../../../components/common/MantineIcon';
import { AiAgentIcon } from '../../../ee/features/aiCopilot/components/AiAgentIcon';
import { useTimeAgo } from '../../../hooks/useTimeAgo';
import useTracking from '../../../providers/Tracking/useTracking';
import { EventName } from '../../../types/Events';
import { useUpdateNotification } from '../hooks/useNotifications';
import classes from './DashboardCommentsNotifications.module.css';

type Props = {
    notifications: NotificationAiReview[];
};

const NotificationTime: FC<{ createdAt: Date }> = ({ createdAt }) => {
    const date = useTimeAgo(createdAt);
    return (
        <Tooltip
            position="top-end"
            offset={-2}
            label={
                <Text fz="xs">
                    {dayjs(createdAt).format('YYYY-MM-DD HH:mm:ss')}
                </Text>
            }
        >
            <Text
                ta="right"
                mb="one"
                fw={500}
                className={classes.notificationTime}
            >
                {date}
            </Text>
        </Tooltip>
    );
};

export const AiReviewNotifications: FC<Props> = ({ notifications }) => {
    const { track } = useTracking();
    const theme = useMantineTheme();
    const navigate = useNavigate();
    const { mutateAsync: updateNotification } = useUpdateNotification();

    const handleOnNotificationClick = useCallback(
        async (notification: NotificationAiReview) => {
            await updateNotification({
                notificationId: notification.notificationId,
                resourceType: notification.resourceType,
                toUpdate: {
                    viewed: true,
                },
            });

            track({
                name: EventName.NOTIFICATIONS_ITEM_CLICKED,
                properties: {
                    resourceType: notification.resourceType,
                    event: notification.metadata.event,
                    projectUuid: notification.metadata.projectUuid,
                    fingerprint: notification.metadata.fingerprint,
                    count: notification.metadata.count,
                },
            });

            void navigate(notification.url ?? '/ai-agents/admin/reviews');
        },
        [navigate, track, updateNotification],
    );

    return (
        <>
            {notifications.map((notification) => (
                <Menu.Item
                    p="xs"
                    key={notification.notificationId}
                    leftSection={
                        <Box
                            display="flex"
                            style={{
                                alignItems: 'center',
                                gap: 6,
                            }}
                        >
                            <MantineIcon
                                size={8}
                                icon={IconCircleFilled}
                                style={{
                                    color: notification.viewed
                                        ? 'transparent'
                                        : theme.colors.teal[5],
                                }}
                            />
                            <AiAgentIcon size={16} calm />
                        </Box>
                    }
                    onClick={() => handleOnNotificationClick(notification)}
                    fz="xs"
                >
                    <>
                        <NotificationTime createdAt={notification.createdAt} />
                        <Text className={classes.notificationMessage}>
                            {notification.message}
                        </Text>
                    </>
                </Menu.Item>
            ))}
        </>
    );
};
