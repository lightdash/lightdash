import { FeatureFlags } from '@lightdash/common';
import { useFeatureFlag } from '../../../hooks/useFeatureFlagEnabled';
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

    const { data: dashboardCommentsFeatureFlag } = useFeatureFlag(
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
