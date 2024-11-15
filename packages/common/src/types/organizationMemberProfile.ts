import { type Group } from './groups';
import { type KnexPaginatedData } from './knex-paginate';

export enum OrganizationMemberRole {
    MEMBER = 'member',
    VIEWER = 'viewer',
    INTERACTIVE_VIEWER = 'interactive_viewer',
    EDITOR = 'editor',
    DEVELOPER = 'developer',
    ADMIN = 'admin',
}

export const isOrganizationMemberRole = (
    x: string,
): x is OrganizationMemberRole =>
    Object.values(OrganizationMemberRole).includes(x as OrganizationMemberRole);

/**
 * Profile for a user's membership in an organization
 */
export type OrganizationMemberProfile = {
    /**
     * Unique identifier for the user
     * @format uuid
     */
    userUuid: string;
    userCreatedAt: Date;
    userUpdatedAt: Date;
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
     * Whether the user can login
     */
    isActive: boolean;
    /**
     * Whether the user's invite to the organization has expired
     */
    isInviteExpired?: boolean;
    /**
     * Whether the user doesn't have an authentication method (password or openId)
     */
    isPending?: boolean;
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
    results: KnexPaginatedData<OrganizationMemberProfile[]>;
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
