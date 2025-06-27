import { type CreateEmbedJwt } from '../ee/embed';
import { type Organization } from './organization';
import { type SessionUser } from './user';

/**
 * Prefixes for the authorization tokens we store in the database
 */
export enum AuthTokenPrefix {
    SCIM = 'scim_',
    SERVICE_ACCOUNT = 'ldsvc_',
    PERSONAL_ACCESS_TOKEN = 'ldpat_',
}

/**
 * The dynamic access permissions the account has
 */
export type AccountAccess = {
    /**
     * The dashboard ID the account has access to.
     * This is for backwards compatibility with the current JWT Embed API.
     * */
    dashboardId: string;
    /** The dashboards the account has access to */
    dashboards?: {
        id: string;
        filters: string[];
    }[];
};

type AuthenticationType =
    | 'session'
    | 'pat'
    | 'service-account'
    | 'jwt'
    | 'browserless'
    | 'scim';

/**
 * The account object is used to store the account information for the user.
 * It's meant to be agnostic of the authentication method.
 *
 * AuthData defaults to CreateEmbedJwt for now as we learn more.
 */
export type Account<AuthData extends CreateEmbedJwt | Record<string, unknown>> =
    {
        /** The type of account. 'user' indicates a logged-in user, while 'embed' indicates a potentially anonymous user */
        type: 'embed' | 'user';
        /** The organization the account belongs to */
        organization: Pick<Organization, 'organizationUuid' | 'name'>;
        /** Data around how the account was authenticated */
        authentication: {
            /** The parsed data from the authentication source */
            data: AuthData;
            /** The raw serialized source of the authentication */
            source: string;
            type: AuthenticationType;
        };
        /** The access permissions the account has */
        access: AccountAccess;
        user: SessionUser;
    };
