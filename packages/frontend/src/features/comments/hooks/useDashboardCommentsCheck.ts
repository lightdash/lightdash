import { FeatureFlags } from '@lightdash/common';
import { useFeatureFlagEnabled } from '../../../hooks/useFeatureFlagEnabled';
import { UserWithAbility } from '../../../hooks/user/useUser';

export const useDashboardCommentsCheck = (
    user: UserWithAbility | undefined,
) => {
    const isDashboardTileCommentsFeatureEnabled = useFeatureFlagEnabled(
        FeatureFlags.DashboardTileComments,
    );

    const canViewDashboardComments = !!user?.ability?.can(
        'view',
        'DashboardComments',
    );

    const canCreateDashboardComments = !!user?.ability?.can(
        'create',
        'DashboardComments',
    );

    return {
        isDashboardTileCommentsFeatureEnabled,
        canViewDashboardComments,
        canCreateDashboardComments,
    };
};
