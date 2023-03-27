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

export type OrganizationMemberProfileUpdate = Partial<
    Pick<OrganizationMemberProfile, 'role'>
>;

export type ApiOrganizationMemberProfiles = {
    status: 'ok';
    results: OrganizationMemberProfile[];
};

export type ApiOrganizationMemberProfile = {
    status: 'ok';
    results: OrganizationMemberProfile;
};
