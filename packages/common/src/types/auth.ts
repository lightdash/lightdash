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
} from './user';
import { type UserAttributeValueMap } from './userAttributes';

type AccountAuthType =
    | 'session'
    | 'pat'
    | 'service-account'
    | 'jwt'
    | 'browserless'
    | 'scim';

type IAccountAuth = {
    type: AccountAuthType;
    data?: CreateEmbedJwt;
    source: string;
};

type LightdashAuth<T extends IAccountAuth> = T;

/**
 * Prefixes for the authorization tokens we store in the database
 */
export enum AuthTokenPrefix {
    SCIM = 'scim_',
    SERVICE_ACCOUNT = 'ldsvc_',
    PERSONAL_ACCESS_TOKEN = 'ldpat_',
}

type EmbeddedAccountAuth = LightdashAuth<{
    type: 'jwt';
    data: CreateEmbedJwt;
    source: string;
}>;

type LightdashUserAccountAuth = LightdashAuth<{
    type: 'session';
    source: string;
}>;

type ServiceAccountAuth = LightdashAuth<{
    type: 'service-account';
    source: string;
}>;

type LightdashAccountAuth =
    | EmbeddedAccountAuth
    | LightdashUserAccountAuth
    | ServiceAccountAuth;

export type AccountAccessControls = {
    userAttributes: UserAttributeValueMap;
    intrinsicUserAttributes: IntrinsicUserAttributes;
};

/**
 * The dynamic access permissions the account has
 */
export type AccountAccess = {
    /**
     * The dashboard ID the account has access to.
     * This is for backwards compatibility with the current JWT Embed API.
     * */
    dashboardId: string;
    filtering?: DashboardFilterInteractivityOptions;
    controls?: AccountAccessControls;
};

type ILightdashAccount = {
    organization: Pick<Organization, 'organizationUuid' | 'name'>;
    authentication: LightdashAccountAuth;
    user: AccountUser;
};

type LightdashAccount<T extends ILightdashAccount> = T;

export type ExternalAccount = LightdashAccount<{
    organization: Pick<Organization, 'organizationUuid' | 'name'>;
    authentication: EmbeddedAccountAuth;
    user: ExternalUser;
    /** The access permissions the account has */
    access: AccountAccess;
}>;

/**
 * The account object is used to store the account information for the user.
 * It's meant to be agnostic of the authentication method.
 */
export type Account = ExternalAccount | Pick<ExternalAccount, 'authentication'>;

export function assertEmbeddedAuth(
    account: Account | undefined,
): asserts account is ExternalAccount {
    if (account?.authentication.type !== 'jwt') {
        throw new ForbiddenError('Account is not an embedded account');
    }
}
