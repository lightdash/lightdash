import { NotificationResourceType } from '@lightdash/common';
import { Button, Indicator, Menu } from '@mantine/core';
import { IconBell } from '@tabler/icons-react';
import { FC } from 'react';
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
    const { data: validationData } = useValidation(projectUuid, false);
    const canUserManageValidations = useValidationUserAbility(projectUuid);
    const [hasReadValidationNotification, setHasReadValidationNotification] =
        useValidationNotificationChecker();
    const hasValidationErrors = validationData && validationData?.length > 0;

    // Dashboard comments notifications
    const dashboardCommentsCheck = useDashboardCommentsCheck(user?.data);
    const userCanViewDashboardComments =
        !!dashboardCommentsCheck.isDashboardTileCommentsFeatureEnabled &&
        !!dashboardCommentsCheck.userCanViewDashboardComments;
    const { data: dashboardCommentsNotifications } = useGetNotifications(
        NotificationResourceType.DashboardComments,
        userCanViewDashboardComments,
    );
    const disableBadge =
        (!canUserManageValidations ||
            !hasValidationErrors ||
            hasReadValidationNotification) &&
        !dashboardCommentsNotifications?.filter((n) => !n.viewed)?.length;

    const hasValidationNotifications =
        canUserManageValidations && hasValidationErrors;

    const hasDashboardCommentsNotifications =
        !!dashboardCommentsNotifications?.length;

    return validationData ? (
        <Menu
            withArrow
            shadow="lg"
            position="bottom-end"
            arrowOffset={16}
            offset={-2}
        >
            <Menu.Target>
                <Button
                    variant="default"
                    size="xs"
                    onClick={() => setHasReadValidationNotification()}
                    sx={{
                        // NOTE: Revert overflow so badge doesn't get cropped off
                        '.mantine-Button-label': {
                            overflow: 'revert',
                        },
                    }}
                >
                    <Indicator
                        size={12}
                        color="red"
                        offset={1}
                        disabled={disableBadge}
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
