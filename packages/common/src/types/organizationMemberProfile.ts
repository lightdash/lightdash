import { type Group } from './groups';

export enum OrganizationMemberRole {
    MEMBER = 'member',
    VIEWER = 'viewer',
    INTERACTIVE_VIEWER = 'interactive_viewer',
    EDITOR = 'editor',
    DEVELOPER = 'developer',
    ADMIN = 'admin',
}

export const MemberRoleLabels = {
    [OrganizationMemberRole.MEMBER]: 'Member',
    [OrganizationMemberRole.VIEWER]: 'Viewer',
    [OrganizationMemberRole.INTERACTIVE_VIEWER]: 'Interactive Viewer',
    [OrganizationMemberRole.EDITOR]: 'Editor',
    [OrganizationMemberRole.DEVELOPER]: 'Developer',
    [OrganizationMemberRole.ADMIN]: 'Admin',
} as const;

/**
 * Profile for a user's membership in an organization
 */
export type OrganizationMemberProfile = {
    /**
     * Unique identifier for the user
     * @format uuid
     */
    userUuid: string;
    firstName: string;
    lastName: string;
    email: string;
    /**
     * Unique identifier for the organization the user is a member of
     */
    organizationUuid: string;
    /**
     * The role of the user in the organization
     */
    role: OrganizationMemberRole;
    /**
     * Whether the user has accepted their invite to the organization
     */
    isActive: boolean;
    /**
     * Whether the user's invite to the organization has expired
     */
    isInviteExpired?: boolean;
};

export type OrganizationMemberProfileWithGroups = OrganizationMemberProfile & {
    groups: Pick<Group, 'name' | 'uuid'>[];
};

export const isOrganizationMemberProfileWithGroups = (
    obj: OrganizationMemberProfile | OrganizationMemberProfileWithGroups,
): obj is OrganizationMemberProfileWithGroups => 'groups' in obj;

export type OrganizationMemberProfileUpdate = {
    role: OrganizationMemberRole;
};

export type ApiOrganizationMemberProfiles = {
    status: 'ok';
    results: OrganizationMemberProfile[];
};

export type ApiOrganizationMemberProfile = {
    status: 'ok';
    results: OrganizationMemberProfile;
};

export const getRoleDescription = (role: OrganizationMemberRole) => {
    switch (role) {
        case OrganizationMemberRole.MEMBER:
            return 'No access to projects by default. Project level permissions to be set separately';
        case OrganizationMemberRole.VIEWER:
            return 'Has view only access to all projects';
        case OrganizationMemberRole.INTERACTIVE_VIEWER:
            return 'Has view access to all projects and can create new projects but cannot edit existing projects';
        case OrganizationMemberRole.EDITOR:
            return 'Can create, edit and delete projects';
        case OrganizationMemberRole.DEVELOPER:
            return 'Can create, edit and delete projects';
        case OrganizationMemberRole.ADMIN:
            return 'Full access to entire project, manage all projects and user access';
        default:
            return null;
    }
};
