import {
    ProjectMemberRole,
    type GroupRole,
    type OrganizationRole,
    type ProjectRole,
    type SpaceGroupAccessRole,
} from '../../types/projectMemberRole';
import {
    DirectSpaceAccessOrigin,
    ProjectSpaceAccessOrigin,
    SpaceMemberRole,
    type DirectSpaceAccess,
    type OrganizationSpaceAccess,
    type ProjectSpaceAccess,
    type SpaceAccessInput,
    type SpaceShare,
} from '../../types/space';
import {
    convertOrganizationRoleToProjectRole,
    convertProjectRoleToSpaceRole,
    convertSpaceRoleToProjectRole,
    getHighestProjectRole,
    getHighestSpaceRole,
} from '../../utils/projectMemberRole';

const getUserOrganizationRole = (
    organizationAccess: OrganizationSpaceAccess[],
    userUuid: string,
): OrganizationRole => {
    const userOrgAccess = organizationAccess.filter(
        (a) => a.userUuid === userUuid,
    );
    return {
        type: 'organization',
        role:
            userOrgAccess.length > 0
                ? convertOrganizationRoleToProjectRole(userOrgAccess[0].role)
                : undefined,
    };
};

const getUserProjectRole = (
    projectAccess: ProjectSpaceAccess[],
    userUuid: string,
): ProjectRole => {
    const userProjectAccess = projectAccess.filter(
        (a) =>
            a.userUuid === userUuid &&
            a.from === ProjectSpaceAccessOrigin.PROJECT_MEMBERSHIP,
    );

    return {
        type: 'project',
        role:
            userProjectAccess.length > 0
                ? userProjectAccess[0].role
                : undefined,
    };
};

const getUserProjectGroupRoles = (
    projectAccess: ProjectSpaceAccess[],
    userUuid: string,
): GroupRole[] => {
    const userProjectGroups = projectAccess.filter(
        (a) =>
            a.userUuid === userUuid &&
            a.from === ProjectSpaceAccessOrigin.GROUP_MEMBERSHIP,
    );

    return userProjectGroups.map((entry) => ({
        type: 'group',
        role: entry.role,
    }));
};

const getUserDirectGroupAccess = (
    directAccess: DirectSpaceAccess[],
    userUuid: string,
): SpaceGroupAccessRole[] => {
    const userDirectGroups = directAccess.filter(
        (a) =>
            a.userUuid === userUuid &&
            a.from === DirectSpaceAccessOrigin.GROUP_ACCESS,
    );

    return userDirectGroups.map((entry) => ({
        type: 'space_group',
        role: convertSpaceRoleToProjectRole(entry.role),
    }));
};

const getSpaceRole = (
    highestRole: ProjectMemberRole,
    userDirectAccess: DirectSpaceAccess[],
    isPrivate: boolean,
): SpaceMemberRole | undefined => {
    const userAccessEntries = userDirectAccess.filter(
        (a) => a.from === DirectSpaceAccessOrigin.USER_ACCESS,
    );
    const groupAccessEntries = userDirectAccess.filter(
        (a) => a.from === DirectSpaceAccessOrigin.GROUP_ACCESS,
    );

    const hasDirectAccess = userDirectAccess.length > 0;

    if (highestRole === ProjectMemberRole.ADMIN) {
        return SpaceMemberRole.ADMIN;
    }
    if (hasDirectAccess) {
        // If user has explicit user role in space, use that; otherwise use highest group role
        const userSpaceRole =
            userAccessEntries.length > 0
                ? userAccessEntries[0].role
                : undefined;
        return (
            userSpaceRole ??
            getHighestSpaceRole(groupAccessEntries.map((e) => e.role))
        );
    }
    if (!isPrivate) {
        return convertProjectRoleToSpaceRole(highestRole);
    }

    return undefined;
};

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

    const organizationRole = getUserOrganizationRole(
        organizationAccess,
        userUuid,
    );
    const projectRole = getUserProjectRole(projectAccess, userUuid);
    const groupRoles = getUserProjectGroupRoles(projectAccess, userUuid);
    const spaceGroupAccessRoles = getUserDirectGroupAccess(
        directAccess,
        userUuid,
    );

    // Compute highest role across all sources
    const highestRole = getHighestProjectRole([
        organizationRole,
        projectRole,
        ...groupRoles,
        ...spaceGroupAccessRoles,
    ]);

    if (!highestRole) return undefined;

    const userDirectAccess = directAccess.filter(
        (a) => a.userUuid === userUuid,
    );

    const spaceRole = getSpaceRole(
        highestRole.role,
        userDirectAccess,
        isPrivate,
    );
    if (!spaceRole) return undefined;

    // Compute highest project role (org + direct project membership only)
    const highestProjectRole = getHighestProjectRole([
        organizationRole,
        projectRole,
    ]);

    return {
        userUuid,
        firstName: info.firstName,
        lastName: info.lastName,
        email: info.email,
        role: spaceRole,
        hasDirectAccess: userDirectAccess.length > 0,
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
