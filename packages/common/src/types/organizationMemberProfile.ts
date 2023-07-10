export enum OrganizationMemberRole {
    MEMBER = 'member',
    VIEWER = 'viewer',
    INTERACTIVE_VIEWER = 'interactive_viewer',
    EDITOR = 'editor',
    DEVELOPER = 'developer',
    ADMIN = 'admin',
}

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

export const getTitleForRole = (role: OrganizationMemberRole) => {
    if (role === OrganizationMemberRole.MEMBER) {
        return 'No access to projects by default. Project level permissions to be set separately';
    }
    if (role === OrganizationMemberRole.VIEWER) {
        return ' Has view only access to all projects';
    }
    if (role === OrganizationMemberRole.INTERACTIVE_VIEWER) {
        return 'Has view access to all projects and can create new projects but cannot edit existing projects';
    }
    if (role === OrganizationMemberRole.EDITOR) {
        return 'Can create, edit and delete projects';
    }
    if (role === OrganizationMemberRole.DEVELOPER) {
        return 'Can create, edit and delete projects';
    }
    if (role === OrganizationMemberRole.ADMIN) {
        return 'Full access to entire project, manage all projects and user access';
    }
    return null;
};
