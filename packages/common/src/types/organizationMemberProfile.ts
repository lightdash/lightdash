export enum OrganizationMemberRole {
    VIEWER = 'viewer',
    MEMBER = 'member',
    EDITOR = 'editor',
    ADMIN = 'admin',
}

export type OrganizationMemberProfile = {
    userUuid: string;
    firstName: string;
    lastName: string;
    email: string;
    organizationUuid: string;
    role: OrganizationMemberRole;
    isActive: boolean;
    isInviteExpired?: boolean;
};

export type OrganizationMemberProfileUpdate = Partial<
    Pick<OrganizationMemberProfile, 'role'>
>;
