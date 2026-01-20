import { FeatureFlags } from '@lightdash/common';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import { type UserWithAbility } from '../../../hooks/user/useUser';

export const useDashboardCommentsCheck = (
    user: UserWithAbility | undefined,
) => {
    const canViewDashboardComments = !!user?.ability?.can(
        'view',
        'DashboardComments',
    );

    const canCreateDashboardComments = !!user?.ability?.can(
        'create',
        'DashboardComments',
    );

    const { data: dashboardCommentsFeatureFlag } = useServerFeatureFlag(
        FeatureFlags.DashboardComments,
    );

    // We want to keep this flag enabled by default, so users on self-hosting can use this feature
    const isDashboardCommentsEnabled =
        dashboardCommentsFeatureFlag?.enabled ?? true;

    return {
        canViewDashboardComments:
            isDashboardCommentsEnabled && canViewDashboardComments,
        canCreateDashboardComments:
            isDashboardCommentsEnabled && canCreateDashboardComments,
    };
};
