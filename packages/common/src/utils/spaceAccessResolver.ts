import {
    ProjectMemberRole,
    type GroupRole,
    type OrganizationRole,
    type ProjectRole,
    type SpaceGroupAccessRole,
} from '../types/projectMemberRole';
import {
    DirectSpaceAccessOrigin,
    ProjectSpaceAccessOrigin,
    SpaceMemberRole,
    type SpaceAccessInput,
    type SpaceShare,
} from '../types/space';
import {
    convertOrganizationRoleToProjectRole,
    convertProjectRoleToSpaceRole,
    convertSpaceRoleToProjectRole,
    getHighestProjectRole,
    getHighestSpaceRole,
} from './projectMemberRole';

const resolveUserSpaceAccess = (
    userUuid: string,
    input: SpaceAccessInput,
): SpaceShare | undefined => {
    const {
        isPrivate,
        directAccess,
        projectAccess,
        organizationAccess,
        userInfo,
    } = input;

    const info = userInfo.get(userUuid);
    if (!info) return undefined;

    // Organization role
    const userOrgAccess = organizationAccess.filter(
        (a) => a.userUuid === userUuid,
    );
    const orgRole: OrganizationRole = {
        type: 'organization',
        role:
            userOrgAccess.length > 0
                ? convertOrganizationRoleToProjectRole(userOrgAccess[0].role)
                : undefined,
    };

    // Project direct membership roles
    const userProjectAccess = projectAccess.filter(
        (a) => a.userUuid === userUuid,
    );
    const projectDirectEntries = userProjectAccess.filter(
        (a) => a.from === ProjectSpaceAccessOrigin.PROJECT_MEMBERSHIP,
    );
    const projectGroupEntries = userProjectAccess.filter(
        (a) => a.from === ProjectSpaceAccessOrigin.GROUP_MEMBERSHIP,
    );

    const projectRole: ProjectRole = {
        type: 'project',
        role:
            projectDirectEntries.length > 0
                ? projectDirectEntries[0].role
                : undefined,
    };

    const groupRoles: GroupRole[] = projectGroupEntries.map((entry) => ({
        type: 'group',
        role: entry.role,
    }));

    // Direct space access
    const userDirectAccess = directAccess.filter(
        (a) => a.userUuid === userUuid,
    );
    const userAccessEntries = userDirectAccess.filter(
        (a) => a.from === DirectSpaceAccessOrigin.USER_ACCESS,
    );
    const groupAccessEntries = userDirectAccess.filter(
        (a) => a.from === DirectSpaceAccessOrigin.GROUP_ACCESS,
    );

    const spaceGroupAccessRoles: SpaceGroupAccessRole[] =
        groupAccessEntries.map((entry) => ({
            type: 'space_group',
            role: convertSpaceRoleToProjectRole(entry.role),
        }));

    // Compute highest role across all sources
    const highestRole = getHighestProjectRole([
        orgRole,
        projectRole,
        ...groupRoles,
        ...spaceGroupAccessRoles,
    ]);

    // Compute highest project role (org + direct project membership only)
    const highestProjectRole = getHighestProjectRole([orgRole, projectRole]);

    if (!highestRole) return undefined;

    const hasDirectAccess = userDirectAccess.length > 0;

    let spaceRole: SpaceMemberRole | undefined;

    if (highestRole.role === ProjectMemberRole.ADMIN) {
        spaceRole = SpaceMemberRole.ADMIN;
    } else if (hasDirectAccess) {
        // If user has explicit user role in space, use that; otherwise use highest group role
        const userSpaceRole =
            userAccessEntries.length > 0
                ? userAccessEntries[0].role
                : undefined;
        spaceRole =
            userSpaceRole ??
            getHighestSpaceRole(groupAccessEntries.map((e) => e.role));
    } else if (!isPrivate) {
        spaceRole = convertProjectRoleToSpaceRole(highestRole.role);
    } else {
        // Private space, no direct access, not admin → exclude
        return undefined;
    }

    if (!spaceRole) return undefined;

    return {
        userUuid,
        firstName: info.firstName,
        lastName: info.lastName,
        email: info.email,
        role: spaceRole,
        hasDirectAccess,
        inheritedRole: highestRole.role,
        inheritedFrom: highestRole.type,
        projectRole: highestProjectRole?.role,
    };
};

export const resolveSpaceAccess = (input: SpaceAccessInput): SpaceShare[] => {
    const { directAccess, projectAccess, organizationAccess } = input;

    // Collect all unique user UUIDs
    const allUserUuids = new Set<string>();
    for (const entry of directAccess) allUserUuids.add(entry.userUuid);
    for (const entry of projectAccess) allUserUuids.add(entry.userUuid);
    for (const entry of organizationAccess) allUserUuids.add(entry.userUuid);

    return Array.from(allUserUuids)
        .map((userUuid) => resolveUserSpaceAccess(userUuid, input))
        .filter((share): share is SpaceShare => share !== undefined);
};
