import { type AbilityBuilder } from '@casl/ability';
import { type MemberAbility } from '../authorization/types';
import { type AnyType } from './any';
import { type OpenIdIdentityIssuerType } from './openIdIdentity';
import { type Organization } from './organization';
import { type OrganizationMemberRole } from './organizationMemberProfile';

export type AccountUser = {
    id: string;
    email: string | undefined;
    /* Whether the user can login */
    isActive: boolean;
    abilityRules: AbilityBuilder<MemberAbility>['rules'];
    ability: MemberAbility;
    type: 'lightdash' | 'external';
};

export interface LightdashUser {
    userUuid: string;
    firstName: string;
    lastName: string;
    organizationUuid?: string;
    organizationName?: string;
    organizationCreatedAt?: Date;
    userId: number;
    role?: OrganizationMemberRole;
    isTrackingAnonymized: boolean;
    isMarketingOptedIn: boolean;
    isSetupComplete: boolean;
    email: string | undefined;
    /* Whether the user can login */
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
    /* Whether the user doesn't have an authentication method (password or openId) */
    isPending?: boolean;
}

export interface LightdashSessionUser extends AccountUser {
    type: 'lightdash';
    // The current effective primary key for users. It duplicates user.id.
    userUuid: string;
    // The old sequential primary key for users
    userId: number;
    firstName: string;
    lastName: string;
    organization: Pick<Organization, 'organizationUuid' | 'name'>;
    role?: OrganizationMemberRole;
    isTrackingAnonymized: boolean;
    isMarketingOptedIn: boolean;
    isSetupComplete: boolean;
    createdAt: Date;
    updatedAt: Date;
    /* Whether the user doesn't have an authentication method (password or openId) */
    isPending?: boolean;
}

export interface ExternalUser extends AccountUser {
    type: 'external';
}

export type LightdashUserWithOrg = Required<LightdashUser>;

export const isUserWithOrg = (
    user: LightdashUser,
): user is LightdashUserWithOrg =>
    typeof user.organizationUuid === 'string' &&
    typeof user.organizationName === 'string' &&
    user.organizationCreatedAt instanceof Date &&
    typeof user.role === 'string';

export interface LightdashUserWithAbilityRules extends LightdashUser {
    abilityRules: AbilityBuilder<MemberAbility>['rules'];
}

export interface SessionUser extends LightdashUserWithAbilityRules {
    ability: MemberAbility;
}

export interface UpdatedByUser {
    userUuid: string;
    firstName: string;
    lastName: string;
}

export interface OpenIdUser {
    openId: {
        subject: string;
        issuer: string;
        issuerType: OpenIdIdentityIssuerType;
        email: string;
        firstName: string | undefined;
        lastName: string | undefined;
        groups?: string[] | undefined;
        teamId?: string | undefined;
    };
}

export const isOpenIdUser = (user: AnyType): user is OpenIdUser =>
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

/**
 * Shows the authenticated user
 */
export type ApiGetAuthenticatedUserResponse = {
    status: 'ok';
    results: LightdashUser;
};

export type ApiRegisterUserResponse = {
    status: 'ok';
    results: LightdashUser;
};

export enum LocalIssuerTypes {
    EMAIL = 'email',
    API_TOKEN = 'apiToken',
}

export type LoginOptionTypes = OpenIdIdentityIssuerType | LocalIssuerTypes;

export type LoginOptions = {
    showOptions: LoginOptionTypes[];
    forceRedirect?: boolean;
    redirectUri?: string;
};

export type ApiGetLoginOptionsResponse = {
    status: 'ok';
    results: LoginOptions;
};

export type IntrinsicUserAttributes = {
    email?: string;
};

export const getIntrinsicUserAttributes = (
    user: Pick<LightdashUser, 'email'>,
): IntrinsicUserAttributes => ({
    email: user.email,
});
