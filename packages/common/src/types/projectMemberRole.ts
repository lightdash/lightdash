import { SpaceMemberRole } from './space';

export enum ProjectMemberRole {
    VIEWER = 'viewer',
    INTERACTIVE_VIEWER = 'interactive_viewer',
    EDITOR = 'editor',
    DEVELOPER = 'developer',
    ADMIN = 'admin',
}

export type OrganizationRole = {
    type: 'organization';
    role: ProjectMemberRole | undefined;
};

export type ProjectRole = {
    type: 'project';
    role: ProjectMemberRole | undefined;
};

export type GroupRole = {
    type: 'group';
    role: ProjectMemberRole | undefined;
};

export type SpaceGroupAccessRole = {
    type: 'space_group';
    role: ProjectMemberRole | undefined;
};

export type SpaceAccessRole = {
    type: 'space';
    role: ProjectMemberRole | undefined;
};

export type InheritedRoles = [OrganizationRole, GroupRole, ProjectRole];

const RoleTypes = [
    'organization',
    'project',
    'group',
    'space_group',
    'space',
] as const;

export type RoleType = typeof RoleTypes[number];

export const ProjectRoleTypeLabels: Record<RoleType, string> = {
    organization: 'Organization',
    project: 'Project',
    group: 'Group',
    space_group: 'Space Group',
    space: 'Space',
} as const;

export type InheritedProjectRole = {
    type: RoleType;
    role: ProjectMemberRole;
};

export const ProjectRoleOrder = {
    [ProjectMemberRole.VIEWER]: 0,
    [ProjectMemberRole.INTERACTIVE_VIEWER]: 1,
    [ProjectMemberRole.EDITOR]: 2,
    [ProjectMemberRole.DEVELOPER]: 3,
    [ProjectMemberRole.ADMIN]: 4,
} as const;

export const SpaceRoleOrder = {
    [SpaceMemberRole.VIEWER]: 0,
    [SpaceMemberRole.EDITOR]: 1,
    [SpaceMemberRole.ADMIN]: 2,
} as const;
