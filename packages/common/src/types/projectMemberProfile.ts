import assertUnreachable from '../utils/assertUnreachable';
import { OrganizationMemberRole } from './organizationMemberProfile';

export enum ProjectMemberRole {
    VIEWER = 'viewer',
    EDITOR = 'editor',
    ADMIN = 'admin',
}

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

export const inheritedProjectRoleFromOrgRole = (
    orgRole: OrganizationMemberRole,
): ProjectMemberRole => {
    switch (orgRole) {
        case OrganizationMemberRole.MEMBER:
        case OrganizationMemberRole.VIEWER:
            return ProjectMemberRole.VIEWER;
        case OrganizationMemberRole.EDITOR:
            return ProjectMemberRole.EDITOR;
        case OrganizationMemberRole.ADMIN:
            return ProjectMemberRole.ADMIN;
        default:
            return assertUnreachable(
                orgRole,
                `Organization role ${orgRole} does not match Project roles`,
            );
    }
};
