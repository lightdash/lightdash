import { FeatureFlags } from '@lightdash/common';
import { useServerFeatureFlag } from '../../../../hooks/useServerOrClientFeatureFlag';

export const useAiAgentQueryPathBattleAvailable = (): boolean => {
    const composeSqlRunner = useServerFeatureFlag(
        FeatureFlags.ComposeSqlRunner,
    );
    return composeSqlRunner.data?.enabled === true;
};
