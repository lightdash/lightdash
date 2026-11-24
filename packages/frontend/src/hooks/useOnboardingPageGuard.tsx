import { type ReactElement } from 'react';
import { Navigate } from 'react-router';
import PageSpinner from '../components/PageSpinner';
import useApp from '../providers/App/useApp';
import { type UserWithAbility } from './user/useUser';

type OnboardingPageGuardResult =
    | { status: 'blocked'; element: ReactElement }
    | { status: 'ready'; user: UserWithAbility };

export const useOnboardingPageGuard = (): OnboardingPageGuardResult => {
    const { health, user } = useApp();

    if (health.isInitialLoading || health.error) {
        return { status: 'blocked', element: <PageSpinner /> };
    }

    if (!health.data?.isAuthenticated) {
        return { status: 'blocked', element: <Navigate to="/login" /> };
    }

    if (user.isInitialLoading) {
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

    return { status: 'ready', user: user.data };
};
