import { type CreateEmbedJwt } from '../ee';
import { ForbiddenError } from './errors';
import { type Organization } from './organization';
import {
    type AccountUser,
    type ExternalUser,
    type LightdashSessionUser,
} from './user';

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
    /* The serialized token */
    source: string;
}>;

type LightdashUserAccountAuth = LightdashAuth<{
    type: 'session';
    /* The serialized cookie */
    source: string;
}>;

type ServiceAccountAuth = LightdashAuth<{
    type: 'service-account';
    /* The service account token */
    source: string;
}>;

type LightdashAccountAuth =
    | EmbeddedAccountAuth
    | LightdashUserAccountAuth
    | ServiceAccountAuth;

type AccountOrganization = Pick<Organization, 'organizationUuid' | 'name'>;

type ILightdashAccount = {
    organization: AccountOrganization;
    authentication: LightdashAccountAuth;
    user: AccountUser;
};

type LightdashAccount<T extends ILightdashAccount> = {} & T;

export type ExternalAccount = LightdashAccount<{
    organization: AccountOrganization;
    authentication: EmbeddedAccountAuth;
    user: ExternalUser;
}>;

export type SessionAccount = LightdashAccount<{
    organization: AccountOrganization;
    authentication: LightdashUserAccountAuth;
    user: LightdashSessionUser;
}>;

/**
 * The account object is used to store the account information for the user.
 * It's meant to be agnostic of the authentication method.
 */
export type Account = SessionAccount | ExternalAccount;

export function assertEmbeddedAuth(
    account: Account | undefined,
): asserts account is ExternalAccount {
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
