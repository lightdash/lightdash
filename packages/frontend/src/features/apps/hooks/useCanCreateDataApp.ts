import { subject } from '@casl/ability';
import { useMemo } from 'react';
import { useAbilityContext } from '../../../providers/Ability/useAbilityContext';
import useApp from '../../../providers/App/useApp';

/**
 * Whether the current user can author new data apps in a project. Unlike
 * `useCanEditDataApp` this is project-wide — `create:DataApp` carries no space
 * or ownership context — so it also gates duplicating someone else's app,
 * which forks it into the user's own personal app.
 */
export const useCanCreateDataApp = (
    projectUuid: string | undefined,
): boolean => {
    const ability = useAbilityContext();
    const { user } = useApp();

    return useMemo(() => {
        if (!projectUuid) return false;
        return ability.can(
            'create',
            subject('DataApp', {
                organizationUuid: user.data?.organizationUuid,
                projectUuid,
            }),
        );
    }, [ability, user.data?.organizationUuid, projectUuid]);
};
