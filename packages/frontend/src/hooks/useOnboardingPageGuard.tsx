import { FeatureFlags } from '@lightdash/common';
import { type ReactElement } from 'react';
import { Navigate } from 'react-router';
import PageSpinner from '../components/PageSpinner';
import useApp from '../providers/App/useApp';
import { type UserWithAbility } from './user/useUser';
import { useServerFeatureFlag } from './useServerOrClientFeatureFlag';

type OnboardingPageGuardResult =
    | { status: 'blocked'; element: ReactElement }
    | { status: 'ready'; user: UserWithAbility };

export const useOnboardingPageGuard = (): OnboardingPageGuardResult => {
    const { health, user } = useApp();
    const orgSetupPageFlag = useServerFeatureFlag(
        FeatureFlags.OrganizationSetupPage,
    );

    if (health.isInitialLoading || health.error) {
        return { status: 'blocked', element: <PageSpinner /> };
    }

    if (!health.data?.isAuthenticated) {
        return { status: 'blocked', element: <Navigate to="/login" /> };
    }

    if (user.isInitialLoading || orgSetupPageFlag.isLoading) {
        return { status: 'blocked', element: <PageSpinner /> };
    }

    if (!user.data) {
        return { status: 'blocked', element: <PageSpinner /> };
    }

    if (!user.data.organizationUuid) {
        return {
            status: 'blocked',
            element: <Navigate to="/join-organization" />,
        };
    }

    if (!orgSetupPageFlag.data?.enabled) {
        return { status: 'blocked', element: <Navigate to="/" /> };
    }

    return { status: 'ready', user: user.data };
};
