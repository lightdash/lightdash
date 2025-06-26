import { type CreateEmbedJwt } from '../ee';
import { type Organization } from './organization';
import { type SessionUser } from './user';

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

/**
 * The account object is used to store the account information for the user.
 * It's meant to be agnostic of the authentication method.
 */
export type Account = {
    organization: Pick<Organization, 'organizationUuid'>;
    authentication: LightdashAccountAuth;
    user: SessionUser;
};

export function getEmbeddedAuth(account: Account): EmbeddedAccountAuth {
    if (account.authentication.type !== 'jwt') {
        throw new Error('Account is not an embedded account');
    }
    return account.authentication;
}
