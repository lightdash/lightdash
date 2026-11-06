import { subject } from '@casl/ability';
import { useIsResultsCacheEnabled } from '../../hooks/useProjectResultsCacheSettings';
import useApp from '../../providers/App/useApp';

export const useCanClearCachedResults = (projectUuid: string | undefined) => {
    const { user } = useApp();
    const canManageProject =
        !!projectUuid &&
        !!user.data?.ability.can(
            'manage',
            subject('Project', {
                organizationUuid: user.data.organizationUuid,
                projectUuid,
            }),
        );
    const isResultsCacheEnabled = useIsResultsCacheEnabled(
        canManageProject ? projectUuid : undefined,
    );
    return canManageProject && isResultsCacheEnabled;
};
