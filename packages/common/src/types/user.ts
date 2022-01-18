import { OrganizationMemberRole } from './organizationMemberProfile';

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
}

export interface SessionUser extends LightdashUser {
    userId: number;
    role: OrganizationMemberRole;
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
