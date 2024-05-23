import { NotificationResourceType } from '@lightdash/common';
import { Button, Indicator, Menu } from '@mantine/core';
import { IconBell } from '@tabler/icons-react';
import { type FC } from 'react';
import { useDashboardCommentsCheck } from '../../../features/comments';
import {
    DashboardCommentsNotifications,
    useGetNotifications,
} from '../../../features/notifications';
import {
    useValidation,
    useValidationNotificationChecker,
    useValidationUserAbility,
} from '../../../hooks/validation/useValidation';
import { useApp } from '../../../providers/AppProvider';
import MantineIcon from '../../common/MantineIcon';
import { ValidationErrorNotification } from './ValidationErrorNotification';

export const NotificationsMenu: FC<{ projectUuid: string }> = ({
    projectUuid,
}) => {
    const { user } = useApp();

    // Validator notifications
    const { data: validationData } = useValidation(projectUuid, user, false);
    const canUserManageValidations = useValidationUserAbility(projectUuid);
    const [hasReadValidationNotification, setHasReadValidationNotification] =
        useValidationNotificationChecker();
    const hasValidationNotifications =
        validationData && validationData.length > 0;

    // Dashboard comments notifications
    const { canViewDashboardComments } = useDashboardCommentsCheck(user?.data);
    const { data: dashboardCommentsNotifications } = useGetNotifications(
        NotificationResourceType.DashboardComments,
        canViewDashboardComments,
    );
    const hasDashboardCommentsNotifications =
        dashboardCommentsNotifications &&
        dashboardCommentsNotifications.length > 0;

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
            return hasUnreadComments;
        }

        return false;
    };

    const shouldDisplayMenu =
        canViewDashboardComments || canUserManageValidations;

    return shouldDisplayMenu ? (
        <Menu
            withArrow
            shadow="lg"
            position="bottom-end"
            arrowOffset={16}
            offset={-2}
        >
            <Menu.Target>
                <Button
                    aria-label="Notifications"
                    variant="default"
                    size="xs"
                    // NOTE: Set validation notification as read (Local Storage)
                    onClick={setHasReadValidationNotification}
                    sx={{
                        // NOTE: Revert overflow so badge doesn't get cropped off
                        '.mantine-Button-label': { overflow: 'revert' },
                    }}
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
                        validationData={validationData}
                    />
                )}
                {hasDashboardCommentsNotifications && (
                    <DashboardCommentsNotifications
                        notifications={dashboardCommentsNotifications}
                        projectUuid={projectUuid}
                    />
                )}
                {!hasValidationNotifications &&
                    !hasDashboardCommentsNotifications && (
                        <Menu.Item>No notifications</Menu.Item>
                    )}
            </Menu.Dropdown>
        </Menu>
    ) : null;
};
