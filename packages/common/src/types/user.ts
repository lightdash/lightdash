import { AbilityBuilder } from '@casl/ability';
import { MemberAbility } from '../authorization/types';
import { EmailStatusExpiring } from './email';
import { OrganizationMemberRole } from './organizationMemberProfile';

export interface LightdashUser {
    userUuid: string;
    email: string | undefined;
    firstName: string;
    lastName: string;
    organizationUuid?: string;
    organizationName?: string;
    organizationCreatedAt?: Date;
    isTrackingAnonymized: boolean;
    isMarketingOptedIn: boolean;
    isSetupComplete: boolean;
    role?: OrganizationMemberRole;
    isActive: boolean;
}

export type LightdashUserWithOrg = Required<LightdashUser>;

export const isUserWithOrg = (
    user: LightdashUser,
): user is LightdashUserWithOrg =>
    user.organizationUuid !== undefined &&
    user.organizationName !== undefined &&
    user.organizationCreatedAt !== undefined &&
    user.role !== undefined;

export interface LightdashUserWithAbilityRules extends LightdashUser {
    abilityRules: AbilityBuilder<MemberAbility>['rules'];
}

export interface SessionUser extends LightdashUserWithAbilityRules {
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
        issuerType: 'google' | 'okta' | 'oneLogin';
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
    typeof user.openId.email === 'string' &&
    typeof user.openId.issuerType === 'string';

export type UserAllowedOrganization = {
    organizationUuid: string;
    name: string;
    membersCount: number;
};

export type ApiUserAllowedOrganizationsResponse = {
    status: 'ok';
    results: UserAllowedOrganization[];
};
