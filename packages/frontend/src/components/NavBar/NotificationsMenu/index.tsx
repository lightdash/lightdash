import { FeatureFlags } from '@lightdash/common';
import { Button, Indicator, Menu } from '@mantine/core';
import { IconBell } from '@tabler/icons-react';
import { useFeatureFlagEnabled } from 'posthog-js/react';
import { FC } from 'react';
import { useGetDashboardCommentsNotifications } from '../../../features/dashboardTilecomments/hooks/useComments';
import {
    useValidation,
    useValidationNotificationChecker,
    useValidationUserAbility,
} from '../../../hooks/validation/useValidation';
import { useApp } from '../../../providers/AppProvider';
import MantineIcon from '../../common/MantineIcon';
import { DashboardTileCommentsNotifications } from './DashboardTileCommentsNotifications';
import { ValidationErrorNotification } from './ValidationErrorNotification';

export const NotificationsMenu: FC<{ projectUuid: string }> = ({
    projectUuid,
}) => {
    const app = useApp();
    const userCanManageDashboardComments = app.user.data?.ability?.can(
        'manage',
        'DashboardComments',
    );
    const isDashboardTileCommentsFeatureEnabled = useFeatureFlagEnabled(
        FeatureFlags.DashboardTileComments,
    );
    const { data: dashboardCommentsNotifications, refetch } =
        useGetDashboardCommentsNotifications(
            !!userCanManageDashboardComments &&
                !!isDashboardTileCommentsFeatureEnabled,
        );

    const { data: validationData } = useValidation(projectUuid, false);
    const canUserManageValidations = useValidationUserAbility(projectUuid);
    const [hasReadValidationNotification, setHasReadValidationNotification] =
        useValidationNotificationChecker();

    const hasValidationErrors = validationData && validationData?.length > 0;

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
            onOpen={refetch}
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

                {isDashboardTileCommentsFeatureEnabled && (
                    <DashboardTileCommentsNotifications
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
