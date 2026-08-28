import { subject } from '@casl/ability';
import { type SpaceMemberRole } from '@lightdash/common';
import { useSpaceSummaries } from '../../../hooks/useSpaces';
import { useAbilityContext } from '../../../providers/Ability/useAbilityContext';
import useApp from '../../../providers/App/useApp';

type DirectAccessManageTarget = {
    projectUuid: string | undefined;
    /** Personal data apps have no space and authorize against their creator. */
    spaceUuid: string | null;
    createdByUserUuid: string | null;
    /** Access entries the resource itself reports for the viewer. */
    access: { userUuid: string; role: SpaceMemberRole }[];
    /** Roles held through direct grants on this resource. */
    grantRoles: SpaceMemberRole[];
};

/**
 * Mirrors the backend's `authorizeManage`: managing who a resource is shared
 * with is a space-admin power (creator rights for space-less apps), not the
 * same thing as being able to edit the resource. Access can arrive through the
 * space, through the resource's own access rows, or through a direct grant —
 * a grant never puts its parent space in the viewer's space list, so the space
 * summaries alone under-report what the viewer may do.
 */
export const useCanManageDirectAccess = ({
    projectUuid,
    spaceUuid,
    createdByUserUuid,
    access,
    grantRoles,
}: DirectAccessManageTarget): boolean => {
    const ability = useAbilityContext();
    const { user } = useApp();
    const { data: spaces = [] } = useSpaceSummaries(projectUuid, true, {});
    const organizationUuid = user.data?.organizationUuid;
    const userUuid = user.data?.userUuid;

    if (!projectUuid || !userUuid) return false;

    const spaceAccess = spaceUuid
        ? spaces.find((space) => space.uuid === spaceUuid)?.userAccess
        : undefined;
    const resolvedAccess = [
        ...access,
        ...(spaceAccess ? [spaceAccess] : []),
        ...grantRoles.map((role) => ({ userUuid, role })),
    ];

    // Not memoized on purpose: every caller passes fresh arrays (`[]`,
    // `chart.access ?? []`), so a memo would miss its cache on every render
    // while pretending otherwise. The work is one array build plus a CASL
    // check, the same shape the surrounding menus already do inline.
    return spaceUuid !== null
        ? ability.can(
              'manage',
              subject('Space', {
                  organizationUuid,
                  projectUuid,
                  access: resolvedAccess,
              }),
          )
        : ability.can(
              'manage',
              subject('DataApp', {
                  organizationUuid,
                  projectUuid,
                  access: resolvedAccess,
                  // A null creator can never match the self rule.
                  createdByUserUuid: createdByUserUuid ?? '',
              }),
          );
};
