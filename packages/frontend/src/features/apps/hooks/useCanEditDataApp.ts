import { subject } from '@casl/ability';
import { type SpaceSummary } from '@lightdash/common';
import { useCallback, useMemo } from 'react';
import { useSpaceSummaries } from '../../../hooks/useSpaces';
import { useAbilityContext } from '../../../providers/Ability/useAbilityContext';
import useApp from '../../../providers/App/useApp';

type DataAppAccess = {
    spaceUuid: string | null;
    createdByUserUuid: string | null;
};

const canManageDataApp = (
    ability: ReturnType<typeof useAbilityContext>,
    organizationUuid: string | undefined,
    projectUuid: string | undefined,
    spaces: Pick<SpaceSummary, 'uuid' | 'userAccess'>[],
    app: DataAppAccess,
): boolean => {
    if (!projectUuid) return false;
    const userSpaceAccess = app.spaceUuid
        ? spaces.find((s) => s.uuid === app.spaceUuid)?.userAccess
        : undefined;
    return ability.can(
        'manage',
        subject('DataApp', {
            organizationUuid,
            projectUuid,
            access: userSpaceAccess ? [userSpaceAccess] : [],
            createdByUserUuid: app.createdByUserUuid,
        }),
    );
};

/**
 * Whether the current user can manage (edit) a given data app. Space
 * editors/admins inherit manage rights on apps in their space, so this resolves
 * the user's access on the app's space before checking the CASL ability.
 *
 * Shared by the builder and the viewer so both gate edit-actions identically.
 */
export const useCanEditDataApp = (
    projectUuid: string | undefined,
    app: DataAppAccess,
): boolean => {
    const ability = useAbilityContext();
    const { user } = useApp();
    const { data: spaces = [] } = useSpaceSummaries(projectUuid, true, {});
    const { spaceUuid, createdByUserUuid } = app;

    return useMemo(
        () =>
            canManageDataApp(
                ability,
                user.data?.organizationUuid,
                projectUuid,
                spaces,
                { spaceUuid, createdByUserUuid },
            ),
        [
            ability,
            user.data?.organizationUuid,
            projectUuid,
            spaces,
            spaceUuid,
            createdByUserUuid,
        ],
    );
};

/**
 * List variant of `useCanEditDataApp`: returns a checker so callers rendering
 * many apps resolve edit rights per item without a hook call per row.
 */
export const useCanEditDataAppChecker = (
    projectUuid: string | undefined,
): ((app: DataAppAccess) => boolean) => {
    const ability = useAbilityContext();
    const { user } = useApp();
    const { data: spaces = [] } = useSpaceSummaries(projectUuid, true, {});

    return useCallback(
        (app: DataAppAccess) =>
            canManageDataApp(
                ability,
                user.data?.organizationUuid,
                projectUuid,
                spaces,
                app,
            ),
        [ability, user.data?.organizationUuid, projectUuid, spaces],
    );
};
