import {
    type CreateEmbedJwt,
    type DashboardFilterInteractivityOptions,
    type ParameterInteractivityOptions,
} from '../ee';
import { ForbiddenError } from './errors';
import { type Organization } from './organization';
import {
    type AccountUser,
    type ExternalUser,
    type IntrinsicUserAttributes,
    type LightdashSessionUser,
    type LightdashUser,
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

export type AuthType = 'session' | 'pat' | 'service-account' | 'jwt' | 'oauth';

export type PersonalAccessTokenAuth = {
    type: 'pat';
    source: string; // The api key
};

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

export type OauthAuth = {
    type: 'oauth';
    source: string; // The oauth token
    token: string;
    clientId: string;
    scopes: string[];
    expiresAt?: number;
    resource?: URL;
};

export type OssEmbed = {
    projectUuid: string;
    organization: Pick<Organization, 'organizationUuid' | 'name' | 'createdAt'>;
    encodedSecret: string;
    dashboardUuids: string[];
    allowAllDashboards: boolean;
    chartUuids: string[];
    allowAllCharts: boolean;
    createdAt: string;
    user: Pick<LightdashUser, 'userUuid' | 'firstName' | 'lastName'> | null;
};

export type Authentication =
    | SessionAuth
    | JwtAuth
    | ServiceAccountAuth
    | PersonalAccessTokenAuth
    | OauthAuth;

export type UserAccessControls = {
    userAttributes: UserAttributeValueMap;
    intrinsicUserAttributes: IntrinsicUserAttributes;
};

/**
 * Details about the content bound to the given JWT
 */
export type EmbedContent = {
    /** The dashboard UUID the JWT may have access to */
    dashboardUuid?: string;
    /** The chart IDs the JWT dashboard may have access to */
    chartUuids: string[];
    /** Explores available to the embedded dashboard */
    explores: string[];
    /** The type of content */
    type: 'dashboard' | 'chart';
};

export type EmbedAccess = {
    content: EmbedContent;
    /** Dashboard filtering options for interactivity */
    filtering?: DashboardFilterInteractivityOptions;
    /** User-specific access controls */
    controls?: UserAccessControls;
    /** Dashboard parameter interactivity options */
    parameters?: ParameterInteractivityOptions;
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
    /** Is this account for a service account? */
    isServiceAccount: () => boolean;
    /** Is this account for a personal access token? */
    isPatUser: () => boolean;
    /** Is this account for a oauth user? */
    isOauthUser: () => boolean;
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
    access: EmbedAccess;
    /** The embed configuration associated with the JWT */
    embed: OssEmbed;
};

export type ApiKeyAccount = BaseAccountWithHelpers & {
    authentication: PersonalAccessTokenAuth;
    user: LightdashSessionUser;
};

export type ServiceAcctAccount = BaseAccountWithHelpers & {
    authentication: ServiceAccountAuth;
    user: LightdashSessionUser;
};

export type OauthAccount = BaseAccountWithHelpers & {
    authentication: OauthAuth;
    user: LightdashSessionUser;
};

export type Account =
    | SessionAccount
    | AnonymousAccount
    | ApiKeyAccount
    | ServiceAcctAccount
    | OauthAccount;

export type AccountWithoutHelpers<T extends Account> = Omit<
    T,
    keyof AccountHelpers
>;

export function assertEmbeddedAuth(
    account: Account | undefined,
): asserts account is AnonymousAccount {
    if (account?.authentication.type !== 'jwt') {
        throw new ForbiddenError(
            `${account?.authentication.type} Account is not jwt auth`,
        );
    }
}

export function assertSessionAuth(
    account: Account | undefined,
): asserts account is SessionAccount {
    if (account?.authentication.type !== 'session') {
        throw new ForbiddenError(
            `${account?.authentication.type} Account is not session auth`,
        );
    }
}

export function isJwtUser(account?: Account): account is AnonymousAccount {
    if (!account) return false;

    return account.isJwtUser();
}

type AccountWithOrg = Account & {
    organization: {
        organizationUuid: string;
        name: string;
        createdAt: Date;
    };
};

export function assertIsAccountWithOrg(
    account: Account,
): asserts account is AccountWithOrg {
    const { organization } = account;
    const isValidOrg =
        typeof organization.organizationUuid === 'string' &&
        typeof organization.name === 'string' &&
        organization.createdAt instanceof Date;

    if (!isValidOrg) {
        throw new ForbiddenError('Account is not part of an organization');
    }

    if (account.isSessionUser()) {
        const sessionAccount = account as SessionAccount;
        if (typeof sessionAccount.user.role !== 'string')
            throw new ForbiddenError(
                'Session user does not have a role in an organization',
            );
    }
}
