import { FeatureFlags } from '@lightdash/common';
import useApp from '../providers/App/useApp';
import { useServerFeatureFlag } from './useServerOrClientFeatureFlag';

export const usePlaygroundAvailability = () => {
    const { health } = useApp();
    const connectJourneyFlag = useServerFeatureFlag(
        FeatureFlags.ConnectJourney,
    );
    const isConnectJourney = connectJourneyFlag.data?.enabled === true;
    return {
        isConnectJourney,
        isAvailable: isConnectJourney
            ? health.data?.isPlaygroundEnabled === true
            : health.data?.hasPlaygroundProjects === true,
    };
};

export const useCanOfferFirstRunPlayground = (
    isNewOnboarding: boolean,
    needsProject: boolean | undefined,
) => {
    const { isAvailable } = usePlaygroundAvailability();
    return isNewOnboarding && isAvailable && needsProject === true;
};
