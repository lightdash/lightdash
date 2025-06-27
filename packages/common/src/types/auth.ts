import { type CreateEmbedJwt } from '../ee';
import { ForbiddenError } from './errors';
import { type Organization } from './organization';
import { type AccountUser, type ExternalUser } from './user';

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
