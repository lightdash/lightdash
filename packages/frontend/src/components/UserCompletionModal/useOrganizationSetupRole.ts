import { FeatureFlags } from '@lightdash/common';
import { useOrganization } from '../../hooks/organization/useOrganization';
import { useServerFeatureFlag } from '../../hooks/useServerOrClientFeatureFlag';
import useApp from '../../providers/App/useApp';
import { getOrganizationSetupRole } from './organizationSetupRole';

export const useOrganizationSetupRole = () => {
    const { user } = useApp();
    const connectJourneyFlag = useServerFeatureFlag(
        FeatureFlags.ConnectJourney,
    );
    const organization = useOrganization({
        enabled: !!user.data?.organizationUuid,
    });
    return {
        isLoading:
            connectJourneyFlag.isLoading || organization.isInitialLoading,
        role: getOrganizationSetupRole({
            isConnectJourney: connectJourneyFlag.data?.enabled === true,
            userUuid: user.data?.userUuid,
            userOrganizationName: user.data?.organizationName,
            createdByUserUuid: organization.data?.createdByUserUuid ?? null,
        }),
    };
};
