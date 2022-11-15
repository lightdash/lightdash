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
