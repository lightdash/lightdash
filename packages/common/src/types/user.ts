import { type AbilityBuilder } from '@casl/ability';
import { type MemberAbility } from '../authorization/types';
import { type AnyType } from './any';
import { type OpenIdIdentityIssuerType } from './openIdIdentity';
import { type OrganizationMemberRole } from './organizationMemberProfile';

export type AccountUser = {
    /**
     * @deprecated Use `userUuid` for registered users. This field should only
     * be used for anonymous users (where no `userUuid` exists).
     */
    id: string;
    email: string | undefined;
    /* Whether the user can login */
    isActive: boolean;
    abilityRules: AbilityBuilder<MemberAbility>['rules'];
    ability: MemberAbility;
    /* Is this a registered/known user in our DB or an anonymous/external user? */
    type: 'registered' | 'anonymous';
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
    roleUuid?: string;
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
    type: 'registered';
    // The current effective primary key for users. It duplicates user.id.
    userUuid: string;
    // The old sequential primary key for users
    userId: number;
    firstName: string;
    lastName: string;
    role?: OrganizationMemberRole;
    isTrackingAnonymized: boolean;
    isMarketingOptedIn: boolean;
    isSetupComplete: boolean;
    createdAt: Date;
    updatedAt: Date;
    /* Whether the user doesn't have an authentication method (password or openId) */
    isPending?: boolean;
    /* Set only when an admin is impersonating this user via session auth */
    impersonation?: ImpersonationContext;
}

export interface ExternalUser extends AccountUser {
    type: 'anonymous';
}

export type LightdashUserWithOrg = Required<LightdashUser>;

export const isUserWithOrg = (
    user: LightdashUser,
): user is LightdashUserWithOrg =>
    typeof user?.organizationUuid === 'string' &&
    typeof user?.organizationName === 'string' &&
    user?.organizationCreatedAt instanceof Date &&
    typeof user?.role === 'string';

export interface LightdashUserWithAbilityRules extends LightdashUser {
    abilityRules: AbilityBuilder<MemberAbility>['rules'];
}

export interface SessionUser extends LightdashUserWithAbilityRules {
    ability: MemberAbility;
    /**
     * Per-request metadata (IP, user agent, request id) populated by the auth
     * middleware. Used by the audit log; intentionally not persisted in the
     * session store.
     */
    requestContext?: {
        ip?: string;
        userAgent?: string;
        requestId?: string;
    };
    /* Set only when an admin is impersonating this user via session auth */
    impersonation?: ImpersonationContext;
    /**
     * Set only when the request was authenticated via a service-account token.
     * `req.user` is loaded from the SA's dedicated `users` row (linked via
     * `service_accounts.service_account_user_uuid`), so writes attribute the
     * service account itself. This field carries the SA identity for code
     * paths that receive `SessionUser` rather than `Account`.
     */
    serviceAccount?: {
        uuid: string;
        description?: string;
    };
}

export interface ImpersonationContext {
    adminId: string;
    adminEmail: string;
    adminFirstName?: string;
    adminLastName?: string;
    adminRole: string;
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
    results: LightdashUser & { impersonation: ImpersonationInfo | null };
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

export interface ImpersonationInfo {
    adminUserUuid: string;
    adminName: string;
    impersonatedUserUuid: string;
}

export type ApiStartImpersonationRequest = {
    targetUserUuid: string;
};

export type ApiStartImpersonationResponse = {
    status: 'ok';
    results: null;
};

export type ApiStopImpersonationResponse = {
    status: 'ok';
    results: null;
};

export type IntrinsicUserAttributes = {
    email?: string;
};

export const getIntrinsicUserAttributes = (
    user: Pick<LightdashUser, 'email'>,
): IntrinsicUserAttributes => ({
    email: user.email,
});
