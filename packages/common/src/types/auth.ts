import {
    type CreateEmbedJwt,
    type DashboardFilterInteractivityOptions,
} from '../ee';
import { ForbiddenError } from './errors';
import { type Organization } from './organization';
import {
    type AccountUser,
    type ExternalUser,
    type IntrinsicUserAttributes,
    type LightdashSessionUser,
} from './user';
import { type UserAttributeValueMap } from './userAttributes';

/**
 * Prefixes for the authorization tokens we store in the database
 */
export enum AuthTokenPrefix {
    SCIM = 'scim_',
    SERVICE_ACCOUNT = 'ldsvc_',
    PERSONAL_ACCESS_TOKEN = 'ldpat_',
    OAUTH_APP = 'ldapp_',
    OAUTH_REFRESH = 'ldref_',
}

export type AuthType =
    | 'session'
    | 'pat'
    | 'service-account'
    | 'jwt'
    | 'browserless'
    | 'scim';

export type SessionAuth = {
    type: 'session';
    source: string; // The serialized cookie
};

export type JwtAuth = {
    type: 'jwt';
    data: CreateEmbedJwt;
    source: string; // The serialized token
};

export type ServiceAccountAuth = {
    type: 'service-account';
    source: string; // The service account token
};

export type Authentication = SessionAuth | JwtAuth | ServiceAccountAuth;

export type UserAccessControls = {
    userAttributes: UserAttributeValueMap;
    intrinsicUserAttributes: IntrinsicUserAttributes;
};

export type DashboardAccess = {
    /** The dashboard ID the account has access to */
    dashboardId: string;
    /** Dashboard filtering options for interactivity */
    filtering?: DashboardFilterInteractivityOptions;
    /** User-specific access controls */
    controls?: UserAccessControls;
};

export type AccountHelpers = {
    /** Is this user logged in? */
    isAuthenticated: () => boolean;
    /** Is this account for a known user in our database? */
    isRegisteredUser: () => boolean;
    /** Is this account for an anonymous external user? */
    isAnonymousUser: () => boolean;
    /** Is this account for a session user? */
    isSessionUser: () => boolean;
    /** Is this account for a JWT user? */
    isJwtUser: () => boolean;
};

export type AccountOrganization = Partial<
    Pick<Organization, 'organizationUuid' | 'name' | 'createdAt'>
>;

/**
 * Base account interface that all account types extend
 */
export type BaseAccount = {
    organization: AccountOrganization;
    authentication: Authentication;
    user: AccountUser;
};

type BaseAccountWithHelpers = BaseAccount & AccountHelpers;

/**
 * Account for registered users with session authentication
 */
export type SessionAccount = BaseAccountWithHelpers & {
    authentication: SessionAuth;
    user: LightdashSessionUser;
};

/**
 * Account for anonymous users with JWT authentication (embeds)
 */
export type AnonymousAccount = BaseAccountWithHelpers & {
    authentication: JwtAuth;
    user: ExternalUser;
    /** The access permissions the account has */
    access: DashboardAccess;
};

export type Account = SessionAccount | AnonymousAccount;

export function assertEmbeddedAuth(
    account: Account | undefined,
): asserts account is AnonymousAccount {
    if (account?.authentication.type !== 'jwt') {
        throw new ForbiddenError('Account is not an embedded account');
    }
}

export function assertSessionAuth(
    account: Account | undefined,
): asserts account is SessionAccount {
    if (account?.authentication.type !== 'session') {
        throw new ForbiddenError('Account is not a session account');
    }
}
