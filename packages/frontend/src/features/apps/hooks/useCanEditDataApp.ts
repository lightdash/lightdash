import { subject } from '@casl/ability';
import {
    canMutateVerifiedContent,
    type ContentVerificationInfo,
    type SpaceSummary,
} from '@lightdash/common';
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

/**
 * `useCanEditDataApp` plus the verified-content gate: a verified app is
 * read-only unless the user manages verified content or verified it.
 */
export const useCanEditVerifiedDataApp = (
    projectUuid: string | undefined,
    app: DataAppAccess & { verification: ContentVerificationInfo | null },
): boolean => {
    const ability = useAbilityContext();
    const { user } = useApp();
    const canEdit = useCanEditDataApp(projectUuid, app);
    const { verification } = app;
    const organizationUuid = user.data?.organizationUuid;
    const userUuid = user.data?.userUuid;

    return useMemo(() => {
        if (!canEdit || !projectUuid || !organizationUuid) return false;
        return canMutateVerifiedContent(
            ability,
            { organizationUuid, projectUuid },
            verification,
            userUuid,
        );
    }, [
        ability,
        canEdit,
        organizationUuid,
        projectUuid,
        userUuid,
        verification,
    ]);
};
