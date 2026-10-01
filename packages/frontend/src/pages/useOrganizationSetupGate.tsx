import { FeatureFlags, type HealthState } from '@lightdash/common';
import { type ReactElement } from 'react';
import { Navigate } from 'react-router';
import PageSpinner from '../components/PageSpinner';
import { type OrganizationSetupRole } from '../components/UserCompletionModal/organizationSetupRole';
import { useOrganizationSetupRole } from '../components/UserCompletionModal/useOrganizationSetupRole';
import { useOrganization } from '../hooks/organization/useOrganization';
import { type UserWithAbility } from '../hooks/user/useUser';
import { useServerFeatureFlag } from '../hooks/useServerOrClientFeatureFlag';
import useApp from '../providers/App/useApp';

type OrganizationSetupGate =
    | { status: 'blocked'; element: ReactElement }
    | {
          status: 'ready';
          user: UserWithAbility;
          health: HealthState;
          organizationHasName: boolean;
          role: OrganizationSetupRole;
      };

export const useOrganizationSetupGate = (
    redirectTo: string,
    isCompletingSetup: boolean,
): OrganizationSetupGate => {
    const { health, user } = useApp();
    const orgSetupPageFlag = useServerFeatureFlag(FeatureFlags.NewOnboarding);
    const organization = useOrganization({
        enabled: !!user.data?.organizationUuid,
    });
    const setupRole = useOrganizationSetupRole();

    if (health.isInitialLoading || health.error) {
        return { status: 'blocked', element: <PageSpinner /> };
    }
    if (!health.data?.isAuthenticated) {
        return { status: 'blocked', element: <Navigate to="/login" /> };
    }
    if (
        user.isInitialLoading ||
        orgSetupPageFlag.isLoading ||
        setupRole.isLoading ||
        !user.data
    ) {
        return { status: 'blocked', element: <PageSpinner /> };
    }
    if (!user.data.organizationUuid) {
        return {
            status: 'blocked',
            element: <Navigate to="/join-organization" />,
        };
    }
    if (user.data.isSetupComplete && !isCompletingSetup) {
        return { status: 'blocked', element: <Navigate to={redirectTo} /> };
    }
    if (!orgSetupPageFlag.data?.enabled) {
        return { status: 'blocked', element: <Navigate to="/" /> };
    }
    if (organization.isInitialLoading) {
        return { status: 'blocked', element: <PageSpinner /> };
    }
    return {
        status: 'ready',
        user: user.data,
        health: health.data,
        organizationHasName: !!organization.data?.name,
        role: setupRole.role,
    };
};
