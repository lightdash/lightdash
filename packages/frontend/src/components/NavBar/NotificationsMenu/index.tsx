import { Anchor, Button, Indicator, Menu } from '@mantine/core';
import { IconBell, IconMessage2Exclamation } from '@tabler/icons-react';
import { FC } from 'react';
import { useHistory } from 'react-router-dom';
import {
    useGetDashboardCommentsNotifications,
    useMarkDashboardCommentNotificationAsRead,
} from '../../../features/comments/hooks/useComments';
import {
    useValidation,
    useValidationNotificationChecker,
    useValidationUserAbility,
} from '../../../hooks/validation/useValidation';
import MantineIcon from '../../common/MantineIcon';
import { ValidationErrorNotification } from './ValidationErrorNotification';

export const NotificationsMenu: FC<{ projectUuid: string }> = ({
    projectUuid,
}) => {
    const history = useHistory();
    const { data: dashboardCommentsNotifications } =
        useGetDashboardCommentsNotifications();
    const { mutate: markDashboardCommentNotificationAsRead } =
        useMarkDashboardCommentNotificationAsRead();

    const { data: validationData } = useValidation(projectUuid, false);
    const canUserManageValidations = useValidationUserAbility(projectUuid);
    const [hasReadValidationNotification, setHasReadValidationNotification] =
        useValidationNotificationChecker();

    const hasValidationErrors = validationData && validationData?.length > 0;

    const disableBadge =
        !canUserManageValidations ||
        !hasValidationErrors ||
        hasReadValidationNotification ||
        !dashboardCommentsNotifications?.length;

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

            <Menu.Dropdown>
                {hasValidationNotifications && (
                    <ValidationErrorNotification
                        projectUuid={projectUuid}
                        validationData={validationData}
                    />
                )}

                {hasDashboardCommentsNotifications &&
                    dashboardCommentsNotifications.map((notification) => (
                        <Menu.Item
                            key={notification.notificationId}
                            icon={
                                <MantineIcon icon={IconMessage2Exclamation} />
                            }
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
                    ))}

                {!hasValidationNotifications &&
                    !hasDashboardCommentsNotifications && (
                        <Menu.Item>No notifications</Menu.Item>
                    )}
            </Menu.Dropdown>
        </Menu>
    ) : null;
};
