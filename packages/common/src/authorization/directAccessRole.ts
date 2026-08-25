import { SpaceRoleOrder } from '../types/projectMemberRole';
import { SpaceMemberRole } from '../types/space';
import { getHighestSpaceRole } from '../utils/projectMemberRole';

export type DirectAccessRoleInput = {
    logicalSpaceRole: SpaceMemberRole | undefined;
    directUserRole: SpaceMemberRole | undefined;
    directGroupRoles: ReadonlyArray<SpaceMemberRole | undefined>;
    capabilityCeiling: SpaceMemberRole | null;
};

const applyCapabilityCeiling = (
    role: SpaceMemberRole | undefined,
    capabilityCeiling: SpaceMemberRole | null,
): SpaceMemberRole | undefined => {
    if (role === undefined || capabilityCeiling === null) {
        return undefined;
    }

    return SpaceRoleOrder[role] <= SpaceRoleOrder[capabilityCeiling]
        ? role
        : capabilityCeiling;
};

export const resolveDirectAccessRole = ({
    logicalSpaceRole,
    directUserRole,
    directGroupRoles,
    capabilityCeiling,
}: DirectAccessRoleInput): SpaceMemberRole | undefined => {
    const additiveRole = getHighestSpaceRole([
        logicalSpaceRole,
        directUserRole,
        ...directGroupRoles,
    ]);

    return applyCapabilityCeiling(additiveRole, capabilityCeiling);
};

export const canDelegateDirectAccessRole = (
    actorRole: SpaceMemberRole | undefined,
    requestedRole: SpaceMemberRole,
): boolean =>
    actorRole !== undefined &&
    actorRole !== SpaceMemberRole.VIEWER &&
    SpaceRoleOrder[requestedRole] <= SpaceRoleOrder[actorRole];
