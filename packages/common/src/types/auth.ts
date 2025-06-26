import { type EmbedJwt } from '../ee/embed';
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
 * The account object is used to store the account information for the user.
 * It's meant to be agnostic of the authentication method.
 *
 * AuthData defaults to EmbedJwt for now as we learn more.
 */
export type Account<AuthData extends EmbedJwt | Record<string, unknown>> = {
    organization: Pick<Organization, 'organizationUuid'>;
    authentication: {
        data: AuthData;
        source: string;
        type: 'embed';
    };
    user: SessionUser;
};
