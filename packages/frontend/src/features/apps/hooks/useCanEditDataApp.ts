import { subject } from '@casl/ability';
import { useMemo } from 'react';
import { useSpaceSummaries } from '../../../hooks/useSpaces';
import { useAbilityContext } from '../../../providers/Ability/useAbilityContext';
import useApp from '../../../providers/App/useApp';

/**
 * Whether the current user can manage (edit) a given data app. Space
 * editors/admins inherit manage rights on apps in their space, so this resolves
 * the user's access on the app's space before checking the CASL ability.
 *
 * Shared by the builder and the viewer so both gate edit-actions identically.
 */
export const useCanEditDataApp = (
    projectUuid: string | undefined,
    app: { spaceUuid: string | null; createdByUserUuid: string | null },
): boolean => {
    const ability = useAbilityContext();
    const { user } = useApp();
    const { data: spaces = [] } = useSpaceSummaries(projectUuid, true, {});

    return useMemo(() => {
        if (!projectUuid) return false;
        const userSpaceAccess = app.spaceUuid
            ? spaces.find((s) => s.uuid === app.spaceUuid)?.userAccess
            : undefined;
        return ability.can(
            'manage',
            subject('DataApp', {
                organizationUuid: user.data?.organizationUuid,
                projectUuid,
                access: userSpaceAccess ? [userSpaceAccess] : [],
                createdByUserUuid: app.createdByUserUuid,
            }),
        );
    }, [
        ability,
        user.data?.organizationUuid,
        projectUuid,
        spaces,
        app.spaceUuid,
        app.createdByUserUuid,
    ]);
};
