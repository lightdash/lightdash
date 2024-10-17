import { FeatureFlags } from '@lightdash/common';
import { useFeatureFlagEnabled } from '../../../hooks/useFeatureFlagEnabled';
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

    const isDashboardCommentsEnabled = useFeatureFlagEnabled(
        FeatureFlags.DashboardComments,
    );

    return {
        canViewDashboardComments:
            isDashboardCommentsEnabled && canViewDashboardComments,
        canCreateDashboardComments:
            isDashboardCommentsEnabled && canCreateDashboardComments,
    };
};
