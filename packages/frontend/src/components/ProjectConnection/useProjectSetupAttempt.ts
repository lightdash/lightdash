import { FeatureFlags } from '@lightdash/common';
import { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useServerFeatureFlag } from '../../hooks/useServerOrClientFeatureFlag';

export const useProjectSetupAttempt = () => {
    const [setupAttemptUuid] = useState(() => uuidv4());
    const connectJourneyFlag = useServerFeatureFlag(
        FeatureFlags.ConnectJourney,
    );
    const isConnectJourneyEnabled = connectJourneyFlag.data?.enabled === true;
    return {
        isConnectJourneyEnabled,
        setupAttemptPayload: isConnectJourneyEnabled
            ? { setupAttemptUuid }
            : {},
    };
};
