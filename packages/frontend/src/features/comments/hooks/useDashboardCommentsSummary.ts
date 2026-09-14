import { NotificationResourceType } from '@lightdash/common';
import { useCallback, useMemo } from 'react';
import useDashboardContext from '../../../providers/Dashboard/useDashboardContext';
import {
    useGetNotifications,
    useUpdateNotification,
} from '../../notifications/hooks/useNotifications';

/**
 * Dashboard-wide view of the comment state the tiles otherwise expose one at
 * a time: how many open threads there are, and which comment notifications
 * for this dashboard the user has not looked at yet.
 */
export const useDashboardCommentsSummary = () => {
    const dashboardUuid = useDashboardContext((c) => c.dashboard?.uuid);
    const canViewDashboardComments = !!useDashboardContext(
        (c) => c.dashboardCommentsCheck?.canViewDashboardComments,
    );
    const dashboardComments = useDashboardContext((c) => c.dashboardComments);

    const openThreadCount = useMemo(
        () =>
            Object.values(dashboardComments ?? {}).reduce(
                (total, threads) => total + threads.length,
                0,
            ),
        [dashboardComments],
    );

    const { data: notifications } = useGetNotifications(
        NotificationResourceType.DashboardComments,
        canViewDashboardComments,
    );
    const unreadNotifications = useMemo(
        () =>
            (notifications ?? []).filter(
                (n) => !n.viewed && n.metadata?.dashboardUuid === dashboardUuid,
            ),
        [notifications, dashboardUuid],
    );

    const { mutate: updateNotification } = useUpdateNotification();
    const markAllAsViewed = useCallback(() => {
        unreadNotifications.forEach((n) => {
            updateNotification({
                notificationId: n.notificationId,
                resourceType: NotificationResourceType.DashboardComments,
                toUpdate: { viewed: true },
            });
        });
    }, [unreadNotifications, updateNotification]);

    return {
        canViewDashboardComments,
        openThreadCount,
        unreadCount: unreadNotifications.length,
        markAllAsViewed,
    };
};
