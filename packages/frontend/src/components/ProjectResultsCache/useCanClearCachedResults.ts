import { subject } from '@casl/ability';
import { FeatureFlags } from '@lightdash/common';
import { useServerFeatureFlag } from '../../hooks/useServerOrClientFeatureFlag';
import useApp from '../../providers/App/useApp';

export const useCanClearCachedResults = (projectUuid: string | undefined) => {
    const { user } = useApp();
    const { data: resultsCacheFlag } = useServerFeatureFlag(
        FeatureFlags.ResultsCacheEnabled,
    );
    return (
        !!projectUuid &&
        !!resultsCacheFlag?.enabled &&
        !!user.data?.ability.can(
            'manage',
            subject('Project', {
                organizationUuid: user.data.organizationUuid,
                projectUuid,
            }),
        )
    );
};
