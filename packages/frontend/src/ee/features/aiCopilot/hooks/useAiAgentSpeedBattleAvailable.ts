import { FeatureFlags } from '@lightdash/common';
import { useServerFeatureFlag } from '../../../../hooks/useServerOrClientFeatureFlag';

export const useAiAgentSpeedBattleAvailable = (): boolean => {
    const flag = useServerFeatureFlag(FeatureFlags.AiAgentFastDecisions);
    return flag.data?.enabled === true;
};
