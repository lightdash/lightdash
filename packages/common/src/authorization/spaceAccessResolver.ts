import {
    type GroupRole,
    type OrganizationRole,
    type ProjectRole,
    type SpaceGroupAccessRole,
    ProjectMemberRole,
} from '../types/projectMemberRole';
import {
    type DirectSpaceAccess,
    type OrganizationSpaceAccess,
    type ProjectSpaceAccess,
    type SpaceShare,
    DirectSpaceAccessOrigin,
    ProjectRoleOrigin,
    SpaceMemberRole,
} from '../types/space';
import {
    convertOrganizationRoleToProjectRole,
    convertProjectRoleToSpaceRole,
    convertSpaceRoleToProjectRole,
    getHighestProjectRole,
    getHighestSpaceRole,
} from '../utils/projectMemberRole';

export type SpaceAccessContext = {
    directAccess: DirectSpaceAccess[];
    projectAccess: ProjectSpaceAccess[];
    organizationAccess: OrganizationSpaceAccess[];
    isPrivate: boolean;
};

export type SpaceAccessForCasl = {
    isPrivate: boolean;
    access: Pick<SpaceShare, 'userUuid' | 'role' | 'hasDirectAccess'>[];
};

/**
 * Resolves the effective space role for a single user given their various access sources.
 * This mirrors the logic in SpaceModel._getSpaceAccess.
 */
function resolveUserSpaceRole({
    userUuid,
    directUserAccess,
    directGroupAccess,
    orgAccess,
    projectAndGroupAccess,
    isPrivate,
}: {
    userUuid: string;
    directUserAccess: DirectSpaceAccess | undefined;
    directGroupAccess: DirectSpaceAccess[];
    orgAccess: OrganizationSpaceAccess[];
    projectAndGroupAccess: ProjectSpaceAccess[];
    isPrivate: boolean;
}): SpaceAccessForCasl['access'][number] | null {
    // Build role objects for getHighestProjectRole
    const orgRoles: OrganizationRole[] = orgAccess.map((access) => ({
        type: 'organization',
        role: convertOrganizationRoleToProjectRole(access.role),
    }));

    const projectRoles: (ProjectRole | GroupRole)[] = projectAndGroupAccess.map(
        (access) => ({
            type: access.from === ProjectRoleOrigin.GROUP ? 'group' : 'project',
            role: access.role,
        }),
    );

    const spaceGroupRoles: SpaceGroupAccessRole[] = directGroupAccess.map(
        (access) => ({
            type: 'space_group',
            role: convertSpaceRoleToProjectRole(access.role),
        }),
    );

    const highestRole = getHighestProjectRole([
        ...orgRoles,
        ...projectRoles,
        ...spaceGroupRoles,
    ]);

    // No role at all - user has no access
    if (!highestRole) {
        return null;
    }

    const hasDirectAccess =
        directUserAccess !== undefined || directGroupAccess.length > 0;

    let spaceRole: SpaceMemberRole | undefined;

    if (highestRole.role === ProjectMemberRole.ADMIN) {
        // Admins always get admin space role
        spaceRole = SpaceMemberRole.ADMIN;
    } else if (hasDirectAccess) {
        // User has direct access - use explicit user role or highest group role
        spaceRole =
            directUserAccess?.role ??
            getHighestSpaceRole(directGroupAccess.map((access) => access.role));
    } else if (!isPrivate) {
        // Public space - convert project role to space role
        spaceRole = convertProjectRoleToSpaceRole(highestRole.role);
    } else {
        // Private space with no direct access - no access
        return null;
    }

    if (!spaceRole) {
        return null;
    }

    return {
        userUuid,
        role: spaceRole,
        hasDirectAccess,
    };
}

/**
 * Resolves space access for CASL authorization checks.
 *
 * Takes the raw access data (direct, project, org) and resolves it into the format
 * needed for CASL ability checks. The input data may already be filtered by userUuid
 * at the query level if only checking access for a single user.
 *
 * This function mirrors the logic in SpaceModel._getSpaceAccess but operates on
 * pre-fetched data rather than doing the SQL joins itself.
 */
export function resolveSpaceAccessForCasl({
    directAccess,
    projectAccess,
    organizationAccess,
    isPrivate,
}: SpaceAccessContext): SpaceAccessForCasl {
    // Get all unique user UUIDs from all access sources
    const allUserUuids = new Set<string>([
        ...directAccess.map((a) => a.userUuid),
        ...projectAccess.map((a) => a.userUuid),
        ...organizationAccess.map((a) => a.userUuid),
    ]);

    const resolvedAccess: SpaceAccessForCasl['access'] = [];

    for (const userUuid of allUserUuids) {
        // Get this user's direct access (user-level)
        const directUserAccess = directAccess.find(
            (a) =>
                a.userUuid === userUuid &&
                a.from === DirectSpaceAccessOrigin.USER,
        );

        // Get this user's direct access (group-level)
        const directGroupAccess = directAccess.filter(
            (a) =>
                a.userUuid === userUuid &&
                a.from === DirectSpaceAccessOrigin.GROUP,
        );

        // Get this user's org access
        const orgAccess = organizationAccess.filter(
            (a) => a.userUuid === userUuid,
        );

        // Get this user's project access (direct + group)
        const projectAndGroupAccess = projectAccess.filter(
            (a) => a.userUuid === userUuid,
        );

        const resolved = resolveUserSpaceRole({
            userUuid,
            directUserAccess,
            directGroupAccess,
            orgAccess,
            projectAndGroupAccess,
            isPrivate,
        });

        if (resolved) {
            resolvedAccess.push(resolved);
        }
    }

    return {
        isPrivate,
        access: resolvedAccess,
    };
}
