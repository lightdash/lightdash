import {
    type Notification,
    NotificationResourceType,
    ValidationErrorType,
} from '@lightdash/common';
import { Button, getDefaultZIndex, Indicator, Menu } from '@mantine-8/core';
import { IconBell } from '@tabler/icons-react';
import { Fragment, type FC, useMemo } from 'react';
import { useAiAgentPermission } from '../../../ee/features/aiCopilot/hooks/useAiAgentPermission';
import { useDashboardCommentsCheck } from '../../../features/comments';
import {
    AiReviewNotifications,
    DashboardCommentsNotifications,
    useGetNotifications,
} from '../../../features/notifications';
import {
    useValidation,
    useValidationNotificationChecker,
    useValidationUserAbility,
} from '../../../hooks/validation/useValidation';
import useApp from '../../../providers/App/useApp';
import MantineIcon from '../../common/MantineIcon';
import classes from './NotificationsMenu.module.css';
import { ValidationErrorNotification } from './ValidationErrorNotification';

export const NotificationsMenu: FC<{ projectUuid: string }> = ({
    projectUuid,
}) => {
    const { user } = useApp();

    // Validator notifications
    const { data: validationData } = useValidation(projectUuid, user, false);
    // Ignore non-blocking chart configuration warnings in the header count
    const validationErrors = validationData?.filter(
        (v) => v.errorType !== ValidationErrorType.ChartConfiguration,
    );
    const canUserManageValidations = useValidationUserAbility(projectUuid);
    const [hasReadValidationNotification, setHasReadValidationNotification] =
        useValidationNotificationChecker();
    const hasValidationNotifications =
        validationErrors && validationErrors.length > 0;

    // Dashboard comments notifications
    const { canViewDashboardComments } = useDashboardCommentsCheck(user?.data);
    const { data: dashboardCommentsNotifications } = useGetNotifications(
        NotificationResourceType.DashboardComments,
        canViewDashboardComments,
    );
    const hasDashboardCommentsNotifications =
        dashboardCommentsNotifications &&
        dashboardCommentsNotifications.length > 0;
    const canViewAiReviews = useAiAgentPermission({ action: 'manage' });
    const { data: aiReviewNotifications } = useGetNotifications(
        NotificationResourceType.AiReview,
        !!canViewAiReviews,
    );
    const hasAiReviewNotifications =
        aiReviewNotifications && aiReviewNotifications.length > 0;
    const notifications = useMemo<Notification[]>(
        () =>
            [
                ...(dashboardCommentsNotifications ?? []),
                ...(aiReviewNotifications ?? []),
            ].sort(
                (a, b) =>
                    new Date(b.createdAt).getTime() -
                    new Date(a.createdAt).getTime(),
            ),
        [aiReviewNotifications, dashboardCommentsNotifications],
    );

    const showNotificationBadge = () => {
        /**
         * Show notification badge if:
         * - User can manage validations and there are unread validation errors
         * - Feature flag for Dashboard Comments is on and there are unread dashboard comments
         */
        if (canUserManageValidations && hasValidationNotifications) {
            return !hasReadValidationNotification;
        }

        if (canViewDashboardComments) {
            const hasUnreadComments = dashboardCommentsNotifications?.some(
                (n) => !n.viewed,
            );
            if (hasUnreadComments) return true;
        }

        if (canViewAiReviews) {
            const hasUnreadAiReviews = aiReviewNotifications?.some(
                (n) => !n.viewed,
            );
            if (hasUnreadAiReviews) return true;
        }

        return false;
    };

    const shouldDisplayMenu =
        canViewDashboardComments ||
        canUserManageValidations ||
        canViewAiReviews;

    return shouldDisplayMenu ? (
        <Menu
            withArrow
            shadow="lg"
            position="bottom-end"
            arrowOffset={16}
            offset={-2}
            zIndex={getDefaultZIndex('max')}
            portalProps={{ target: '#navbar-header' }}
        >
            <Menu.Target>
                <Button
                    aria-label="Notifications"
                    variant="default"
                    size="xs"
                    // NOTE: Set validation notification as read (Local Storage)
                    onClick={setHasReadValidationNotification}
                    classNames={{ label: classes.buttonLabel }}
                >
                    <Indicator
                        size={12}
                        color="red"
                        offset={1}
                        disabled={!showNotificationBadge()}
                    >
                        <MantineIcon icon={IconBell} />
                    </Indicator>
                </Button>
            </Menu.Target>
            <Menu.Dropdown maw="400px">
                {hasValidationNotifications && (
                    <ValidationErrorNotification
                        projectUuid={projectUuid}
                        validationData={validationErrors}
                    />
                )}
                {notifications.length > 0 && (
                    <>
                        {notifications.map((notification) => (
                            <Fragment key={notification.notificationId}>
                                {notification.resourceType ===
                                NotificationResourceType.DashboardComments ? (
                                    <DashboardCommentsNotifications
                                        notifications={[notification]}
                                        projectUuid={projectUuid}
                                    />
                                ) : (
                                    <AiReviewNotifications
                                        notifications={[notification]}
                                    />
                                )}
                            </Fragment>
                        ))}
                    </>
                )}
                {!hasValidationNotifications &&
                    !hasDashboardCommentsNotifications &&
                    !hasAiReviewNotifications && (
                        <Menu.Item>No notifications</Menu.Item>
                    )}
            </Menu.Dropdown>
        </Menu>
    ) : null;
};
