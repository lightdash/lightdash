import { FeatureFlags } from '@lightdash/common';
import { useFeatureFlagEnabled } from 'posthog-js/react';
import { UserWithAbility } from '../../../hooks/user/useUser';

export const useDashboardCommentsCheck = (
    user: UserWithAbility | undefined,
) => {
    const isDashboardTileCommentsFeatureEnabled = useFeatureFlagEnabled(
        FeatureFlags.DashboardTileComments,
    );

    const userCanViewDashboardComments = user?.ability?.can(
        'view',
        'DashboardComments',
    );

    const userCanManageDashboardComments = user?.ability?.can(
        'manage',
        'DashboardComments',
    );

    return {
        isDashboardTileCommentsFeatureEnabled,
        userCanViewDashboardComments,
        userCanManageDashboardComments,
    };
};
