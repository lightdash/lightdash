import { type AbilityBuilder } from '@casl/ability';
import { type MemberAbility } from '../authorization/types';
import { type AnyType } from './any';
import { type OpenIdIdentityIssuerType } from './openIdIdentity';
import { type OrganizationMemberRole } from './organizationMemberProfile';

export type BaseUser = {
    organizationUuid?: string;
    organizationName?: string;
    organizationCreatedAt?: Date;
    role?: OrganizationMemberRole;
    /* Whether the user can login */
    isActive: boolean;
};

export interface LightdashUser extends BaseUser {
    userUuid: string;
    userId: number;
    type?: 'lightdash';
    email: string | undefined;
    firstName: string;
    lastName: string;
    isTrackingAnonymized: boolean;
    isMarketingOptedIn: boolean;
    isSetupComplete: boolean;
    createdAt: Date;
    updatedAt: Date;
    /* Whether the user doesn't have an authentication method (password or openId) */
    isPending?: boolean;
}

export type ExternalUser = BaseUser &
    Partial<LightdashUser> & {
        externalId: string;
        type: 'external';
    };

export type LightdashUserWithOrg = Required<LightdashUser | ExternalUser>;

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
