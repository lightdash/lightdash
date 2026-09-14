import { FeatureFlags } from '@lightdash/common';
import { useServerFeatureFlag } from '../../../../hooks/useServerOrClientFeatureFlag';

export const useAiAgentBattleModeEnabled = (): boolean => {
    const flag = useServerFeatureFlag(FeatureFlags.AiAgentBattleMode);
    return flag.data?.enabled === true;
};
