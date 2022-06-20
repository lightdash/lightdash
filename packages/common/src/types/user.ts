import { MemberAbility } from '../authorization/types';
import { OrganizationMemberRole } from './organizationMemberProfile';
import { ProjectMemberProfile } from './projectMemberProfile';

export interface LightdashUser {
    userUuid: string;
    email: string | undefined;
    firstName: string;
    lastName: string;
    organizationUuid: string;
    organizationName: string;
    isTrackingAnonymized: boolean;
    isMarketingOptedIn: boolean;
    isSetupComplete: boolean;
    role: OrganizationMemberRole;
    isActive: boolean;
}

export interface LightdashUserWithProjectRoles extends LightdashUser {
    projectRoles: Pick<ProjectMemberProfile, 'projectUuid' | 'role'>[];
}

export interface SessionUser extends LightdashUserWithProjectRoles {
    userId: number;
    ability: MemberAbility;
}

export interface UpdatedByUser {
    userUuid: string;
    firstName: string;
    lastName: string;
}
export const isSessionUser = (user: any): user is SessionUser =>
    typeof user === 'object' &&
    user !== null &&
    user.userUuid &&
    user.userId &&
    user.openId === undefined;

export interface OpenIdUser {
    openId: {
        subject: string;
        issuer: string;
        email: string;
        firstName: string | undefined;
        lastName: string | undefined;
    };
}

export const isOpenIdUser = (user: any): user is OpenIdUser =>
    typeof user === 'object' &&
    user !== null &&
    user.userUuid === undefined &&
    user.userId === undefined &&
    typeof user.openId === 'object' &&
    user.openId !== null &&
    typeof user.openId.subject === 'string' &&
    typeof user.openId.issuer === 'string' &&
    typeof user.openId.email === 'string';
