import assertUnreachable from '../utils/assertUnreachable';
import { OrganizationMemberRole } from './organizationMemberProfile';

export enum ProjectMemberRole {
    VIEWER = 'viewer',
    INTERACTIVE_VIEWER = 'interactive_viewer',
    EDITOR = 'editor',
    DEVELOPER = 'developer',
    ADMIN = 'admin',
}

export const ProjectMemberRoleLabels: Record<ProjectMemberRole, string> = {
    [ProjectMemberRole.VIEWER]: 'Viewer',
    [ProjectMemberRole.INTERACTIVE_VIEWER]: 'Interactive Viewer',
    [ProjectMemberRole.EDITOR]: 'Editor',
    [ProjectMemberRole.DEVELOPER]: 'Developer',
    [ProjectMemberRole.ADMIN]: 'Admin',
} as const;

type OrganizationRole = {
    type: 'organization';
    role: ProjectMemberRole;
};
type ProjectRole = {
    type: 'project';
    role: ProjectMemberRole | undefined;
};

type GroupRole = {
    type: 'group';
    role: ProjectMemberRole | undefined;
};

export type InheritedRoles = [OrganizationRole, GroupRole, ProjectRole];

const RoleTypes = ['organization', 'project', 'group'] as const;
type RoleType = typeof RoleTypes[number];

type InheritedProjectRole = {
    type: RoleType;
    role: ProjectMemberRole;
};

const ProjectRoleOrder = {
    [ProjectMemberRole.VIEWER]: 0,
    [ProjectMemberRole.INTERACTIVE_VIEWER]: 1,
    [ProjectMemberRole.EDITOR]: 2,
    [ProjectMemberRole.DEVELOPER]: 3,
    [ProjectMemberRole.ADMIN]: 4,
} as const;

export const convertOrganizationRoleToProjectRole = (
    organizationRole: OrganizationMemberRole,
): ProjectMemberRole => {
    switch (organizationRole) {
        case OrganizationMemberRole.VIEWER:
            return ProjectMemberRole.VIEWER;
        case OrganizationMemberRole.INTERACTIVE_VIEWER:
            return ProjectMemberRole.INTERACTIVE_VIEWER;
        case OrganizationMemberRole.EDITOR:
            return ProjectMemberRole.EDITOR;
        case OrganizationMemberRole.DEVELOPER:
            return ProjectMemberRole.DEVELOPER;
        case OrganizationMemberRole.ADMIN:
            return ProjectMemberRole.ADMIN;
        case OrganizationMemberRole.MEMBER:
            return ProjectMemberRole.VIEWER;
        default:
            return assertUnreachable(
                organizationRole,
                `Unknown role ${organizationRole}`,
            );
    }
};

export const getHighestProjectRole = (
    inheritedRoles: Array<OrganizationRole | ProjectRole | GroupRole>,
): InheritedProjectRole =>
    inheritedRoles.reduce<InheritedProjectRole>(
        (highestRole, role) => {
            if (role.role === undefined) {
                return highestRole;
            }

            if (
                highestRole.role === undefined ||
                ProjectRoleOrder[role.role] >=
                    ProjectRoleOrder[highestRole.role]
            ) {
                return {
                    type: role.type,
                    role: role.role,
                };
            }

            return highestRole;
        },
        { type: 'project', role: ProjectMemberRole.VIEWER },
    );

export type ProjectMemberProfile = {
    userUuid: string;
    projectUuid: string;
    role: ProjectMemberRole;
    email: string;
    firstName: string;
    lastName: string;
};

export type ProjectMemberProfileUpdate = Partial<
    Pick<ProjectMemberProfile, 'role'>
>;

export type ApiProjectAccessListResponse = {
    status: 'ok';
    results: ProjectMemberProfile[];
};

export type ApiGetProjectMemberResponse = {
    status: 'ok';
    results: ProjectMemberProfile;
};
