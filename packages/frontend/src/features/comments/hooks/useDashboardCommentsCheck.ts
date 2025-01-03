import { FeatureFlags } from '@lightdash/common';
import { useFeatureFlagEnabled as useFeatureFlagEnabledPosthog } from 'posthog-js/react';
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

    // We want to keep this flag enabled by default, so users on self-hosting can use this feature
    const isDashboardCommentsEnabled =
        useFeatureFlagEnabledPosthog(FeatureFlags.DashboardComments) !== false;

    return {
        canViewDashboardComments:
            isDashboardCommentsEnabled && canViewDashboardComments,
        canCreateDashboardComments:
            isDashboardCommentsEnabled && canCreateDashboardComments,
    };
};
