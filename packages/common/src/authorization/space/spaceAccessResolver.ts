import {
    type GroupRole,
    type OrganizationRole,
    type ProjectMemberRole,
    type ProjectRole,
    type SpaceGroupAccessRole,
} from '../../types/projectMemberRole';
import {
    DirectSpaceAccessOrigin,
    ProjectSpaceAccessOrigin,
    type DirectSpaceAccess,
    type OrganizationSpaceAccess,
    type ProjectSpaceAccess,
    type SpaceAccess,
    type SpaceAccessWithInheritanceInput,
    type SpaceMemberRole,
} from '../../types/space';
import {
    convertOrganizationRoleToProjectRole,
    convertProjectRoleToSpaceRole,
    convertSpaceRoleToProjectRole,
    getHighestProjectRole,
    getHighestSpaceRole,
} from '../../utils/projectMemberRole';

type UserChainDirectAccess = {
    spaceUuid: string;
    access: DirectSpaceAccess;
};

// Rows for a single user, pre-grouped so per-user resolution never scans the
// full access arrays. Chain order (leaf to root) is preserved in chainDirect.
type UserAccessRows = {
    chainDirect: UserChainDirectAccess[];
    project: ProjectSpaceAccess[];
    organization: OrganizationSpaceAccess[];
};

const getUserOrganizationRole = (
    userOrgAccess: OrganizationSpaceAccess[],
): OrganizationRole => ({
    type: 'organization',
    role:
        userOrgAccess.length > 0
            ? convertOrganizationRoleToProjectRole(userOrgAccess[0].role)
            : undefined,
});

const getUserProjectRole = (
    userProjectAccess: ProjectSpaceAccess[],
): ProjectRole => {
    const membership = userProjectAccess.find(
        (a) => a.from === ProjectSpaceAccessOrigin.PROJECT_MEMBERSHIP,
    );
    return {
        type: 'project',
        role: membership?.role,
    };
};

const getUserProjectGroupRoles = (
    userProjectAccess: ProjectSpaceAccess[],
): GroupRole[] =>
    userProjectAccess
        .filter((a) => a.from === ProjectSpaceAccessOrigin.GROUP_MEMBERSHIP)
        .map((entry) => ({
            type: 'group',
            role: entry.role,
        }));

const getUserDirectGroupAccess = (
    userChainDirect: UserChainDirectAccess[],
): SpaceGroupAccessRole[] =>
    userChainDirect
        .filter((e) => e.access.from === DirectSpaceAccessOrigin.GROUP_ACCESS)
        .map((e) => ({
            type: 'space_group',
            role: convertSpaceRoleToProjectRole(e.access.role),
        }));

const getSpaceRole = (
    highestProjectRole: ProjectMemberRole,
    userChainDirect: UserChainDirectAccess[],
    leafSpaceUuid: string,
    inheritsFromOrgOrProject: boolean,
): { role: SpaceMemberRole; fromParent: boolean } | undefined => {
    if (userChainDirect.length > 0) {
        // Most permissive wins: highest role across all chain levels, all origins
        const highestDirectRole = getHighestSpaceRole(
            userChainDirect.map((e) => e.access.role),
        );
        if (!highestDirectRole) return undefined;

        // Check if the winning role came from a parent space (not the leaf)
        const winningEntry = userChainDirect.find(
            (e) => e.access.role === highestDirectRole,
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

const resolveUserSpaceAccess = (
    userUuid: string,
    rows: UserAccessRows,
    spaceUuid: string,
    inheritsFromOrgOrProject: boolean,
): SpaceAccess | undefined => {
    // Step 1: Compute highest project-level role (same as existing logic)
    const organizationRole = getUserOrganizationRole(rows.organization);
    const projectRole = getUserProjectRole(rows.project);
    const groupRoles = getUserProjectGroupRoles(rows.project);
    const spaceGroupAccessRoles = getUserDirectGroupAccess(rows.chainDirect);

    const highestRole = getHighestProjectRole([
        organizationRole,
        projectRole,
        ...groupRoles,
        ...spaceGroupAccessRoles,
    ]);

    if (!highestRole) return undefined;

    // Step 2: Compute effective space role using "most permissive wins"
    const spaceRoleResult = getSpaceRole(
        highestRole.role,
        rows.chainDirect,
        spaceUuid,
        inheritsFromOrgOrProject,
    );
    if (!spaceRoleResult) return undefined;

    // Step 3: Determine hasDirectAccess (leaf space only)
    const hasDirectAccess = rows.chainDirect.some(
        (e) => e.spaceUuid === spaceUuid,
    );

    // Step 4: Compute projectRole metadata (org + direct project only)
    const highestProjectRole = getHighestProjectRole([
        organizationRole,
        projectRole,
    ]);

    // Step 5: Determine inheritedFrom — use chain-wide check (not leaf-only)
    const hasAccessInChain = rows.chainDirect.length > 0;
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

export const resolveSpaceAccess = (
    input: SpaceAccessWithInheritanceInput,
): SpaceAccess[] => {
    const {
        spaceUuid,
        inheritsFromOrgOrProject,
        chainDirectAccess,
        projectAccess,
        organizationAccess,
    } = input;

    // Group rows by user once; Map insertion order preserves the previous
    // implementation's output ordering (direct rows first, then project, then org).
    const rowsByUser = new Map<string, UserAccessRows>();
    const getRows = (userUuid: string): UserAccessRows => {
        const existing = rowsByUser.get(userUuid);
        if (existing) return existing;
        const created: UserAccessRows = {
            chainDirect: [],
            project: [],
            organization: [],
        };
        rowsByUser.set(userUuid, created);
        return created;
    };

    for (const chainLevel of chainDirectAccess) {
        for (const access of chainLevel.directAccess) {
            getRows(access.userUuid).chainDirect.push({
                spaceUuid: chainLevel.spaceUuid,
                access,
            });
        }
    }
    for (const access of projectAccess) {
        getRows(access.userUuid).project.push(access);
    }
    for (const access of organizationAccess) {
        getRows(access.userUuid).organization.push(access);
    }

    return Array.from(rowsByUser, ([userUuid, rows]) =>
        resolveUserSpaceAccess(
            userUuid,
            rows,
            spaceUuid,
            inheritsFromOrgOrProject,
        ),
    ).filter((share): share is SpaceAccess => share !== undefined);
};
