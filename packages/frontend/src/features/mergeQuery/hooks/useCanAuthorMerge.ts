import { subject } from '@casl/ability';
import useIsEmbedded from '../../../ee/providers/Embed/useIsEmbedded';
import { useProjectUuid } from '../../../hooks/useProjectUuid';
import { useAbilityContext } from '../../../providers/Ability/useAbilityContext';
import useApp from '../../../providers/App/useApp';

/** Whether the user may build or change a merge; running a saved one needs nothing. */
export const useCanAuthorMerge = (): boolean => {
    const isEmbedded = useIsEmbedded();
    const ability = useAbilityContext();
    const projectUuid = useProjectUuid();
    const { user } = useApp();
    return (
        isEmbedded ||
        ability.can(
            'manage',
            subject('MergeQuery', {
                organizationUuid: user.data?.organizationUuid,
                projectUuid,
            }),
        )
    );
};
