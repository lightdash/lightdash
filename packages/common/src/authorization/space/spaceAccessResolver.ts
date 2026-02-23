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
    type ChainSpaceDirectAccess,
    type DirectSpaceAccess,
    type OrganizationSpaceAccess,
    type ProjectSpaceAccess,
    type SpaceAccess,
    type SpaceAccessInput,
    type SpaceAccessWithInheritanceInput,
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
    inheritsFromOrgOrProject: boolean,
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
    if (inheritsFromOrgOrProject) {
        return convertProjectRoleToSpaceRole(highestRole);
    }

    return undefined;
};

const resolveUserSpaceAccess = (
    userUuid: string,
    input: SpaceAccessInput,
): SpaceAccess | undefined => {
    const {
        inheritsFromOrgOrProject,
        directAccess,
        projectAccess,
        organizationAccess,
    } = input;
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
        inheritsFromOrgOrProject,
    );
    if (!spaceRole) return undefined;

    // Compute highest project role (org + direct project membership only)
    const highestProjectRole = getHighestProjectRole([
        organizationRole,
        projectRole,
    ]);

    return {
        userUuid,
        role: spaceRole,
        hasDirectAccess: userDirectAccess.length > 0,
        inheritedRole: highestRole.role,
        inheritedFrom: highestRole.type,
        projectRole: highestProjectRole?.role,
    };
};

export const resolveSpaceAccess = (input: SpaceAccessInput): SpaceAccess[] => {
    const { directAccess, projectAccess, organizationAccess } = input;

    // Collect all unique user UUIDs
    const uniqueUserUuids = new Set(
        [...directAccess, ...projectAccess, ...organizationAccess].map(
            (e) => e.userUuid,
        ),
    );

    return Array.from(uniqueUserUuids)
        .map((userUuid) => resolveUserSpaceAccess(userUuid, input))
        .filter((share): share is SpaceAccess => share !== undefined);
};

// --- Chain-aware resolution ("most permissive wins") ---

const getSpaceRoleFromChain = (
    highestProjectRole: ProjectMemberRole,
    userUuid: string,
    chainDirectAccess: ChainSpaceDirectAccess[],
    leafSpaceUuid: string,
    inheritsFromOrgOrProject: boolean,
): { role: SpaceMemberRole; fromParent: boolean } | undefined => {
    // Collect all direct access entries for this user across the entire chain
    const allUserEntries: { role: SpaceMemberRole; spaceUuid: string }[] = [];
    for (const chainLevel of chainDirectAccess) {
        for (const access of chainLevel.directAccess) {
            if (access.userUuid === userUuid) {
                allUserEntries.push({
                    role: access.role,
                    spaceUuid: chainLevel.spaceUuid,
                });
            }
        }
    }

    if (allUserEntries.length > 0) {
        // Most permissive wins: highest role across all chain levels, all origins
        const highestDirectRole = getHighestSpaceRole(
            allUserEntries.map((e) => e.role),
        );
        if (!highestDirectRole) return undefined;

        // Check if the winning role came from a parent space (not the leaf)
        const winningEntry = allUserEntries.find(
            (e) => e.role === highestDirectRole,
        );
        const fromParent = winningEntry?.spaceUuid !== leafSpaceUuid;

        return { role: highestDirectRole, fromParent };
    }

    // No direct access anywhere in chain — fall through to project/org inheritance
    if (inheritsFromOrgOrProject) {
        return {
            role: convertProjectRoleToSpaceRole(highestProjectRole),
            fromParent: false, // not from a parent space — access is from org/project level
        };
    }

    return undefined;
};

const resolveUserSpaceAccessWithInheritance = (
    userUuid: string,
    input: SpaceAccessWithInheritanceInput,
): SpaceAccess | undefined => {
    const {
        spaceUuid,
        inheritsFromOrgOrProject,
        chainDirectAccess,
        projectAccess,
        organizationAccess,
    } = input;

    // Step 1: Compute highest project-level role (same as existing logic)
    const organizationRole = getUserOrganizationRole(
        organizationAccess,
        userUuid,
    );
    const projectRole = getUserProjectRole(projectAccess, userUuid);
    const groupRoles = getUserProjectGroupRoles(projectAccess, userUuid);

    // Flatten all direct access for group role computation at project level
    const allDirectAccess = chainDirectAccess.flatMap((c) => c.directAccess);
    const spaceGroupAccessRoles = getUserDirectGroupAccess(
        allDirectAccess,
        userUuid,
    );

    const highestRole = getHighestProjectRole([
        organizationRole,
        projectRole,
        ...groupRoles,
        ...spaceGroupAccessRoles,
    ]);

    if (!highestRole) return undefined;

    // Step 2: Compute effective space role using "most permissive wins"
    const spaceRoleResult = getSpaceRoleFromChain(
        highestRole.role,
        userUuid,
        chainDirectAccess,
        spaceUuid,
        inheritsFromOrgOrProject,
    );
    if (!spaceRoleResult) return undefined;

    // Step 3: Determine hasDirectAccess (leaf space only)
    const leafLevel = chainDirectAccess.find((c) => c.spaceUuid === spaceUuid);
    const hasDirectAccess = leafLevel
        ? leafLevel.directAccess.some((a) => a.userUuid === userUuid)
        : false;

    // Step 4: Compute projectRole metadata (org + direct project only)
    const highestProjectRole = getHighestProjectRole([
        organizationRole,
        projectRole,
    ]);

    // Step 5: Determine inheritedFrom — use chain-wide check (not leaf-only)
    const hasAccessInChain = allDirectAccess.some(
        (a) => a.userUuid === userUuid,
    );
    const inheritedFrom: SpaceAccess['inheritedFrom'] =
        hasAccessInChain && spaceRoleResult.fromParent
            ? 'parent_space'
            : highestRole.type;

    return {
        userUuid,
        role: spaceRoleResult.role,
        hasDirectAccess,
        inheritedRole: highestRole.role,
        inheritedFrom,
        projectRole: highestProjectRole?.role,
    };
};

export const resolveSpaceAccessWithInheritance = (
    input: SpaceAccessWithInheritanceInput,
): SpaceAccess[] => {
    const { chainDirectAccess, projectAccess, organizationAccess } = input;

    const allDirectAccess = chainDirectAccess.flatMap((c) => c.directAccess);

    // Collect all unique user UUIDs
    const uniqueUserUuids = new Set(
        [...allDirectAccess, ...projectAccess, ...organizationAccess].map(
            (e) => e.userUuid,
        ),
    );

    return Array.from(uniqueUserUuids)
        .map((userUuid) =>
            resolveUserSpaceAccessWithInheritance(userUuid, input),
        )
        .filter((share): share is SpaceAccess => share !== undefined);
};
