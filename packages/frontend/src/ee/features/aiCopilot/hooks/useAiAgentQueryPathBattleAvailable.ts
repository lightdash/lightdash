import { FeatureFlags } from '@lightdash/common';
import { useServerFeatureFlag } from '../../../../hooks/useServerOrClientFeatureFlag';

export const useAiAgentQueryPathBattleAvailable = (): boolean => {
    const multiSourceQuery = useServerFeatureFlag(
        FeatureFlags.MultiSourceQuery,
    );
    const composeSqlRunner = useServerFeatureFlag(
        FeatureFlags.ComposeSqlRunner,
    );
    return (
        multiSourceQuery.data?.enabled === true &&
        composeSqlRunner.data?.enabled === true
    );
};
