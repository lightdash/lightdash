import assertUnreachable from '../utils/assertUnreachable';
import {
    BigqueryAuthenticationType,
    DatabricksAuthenticationType,
    SnowflakeAuthenticationType,
    WarehouseTypes,
    type CreateWarehouseCredentials,
} from './projects';

export enum PersonSignInProvider {
    GOOGLE = 'google',
    SNOWFLAKE = 'snowflake',
    DATABRICKS = 'databricks',
}

export const PERSON_SIGN_IN_LABELS: Record<PersonSignInProvider, string> = {
    [PersonSignInProvider.GOOGLE]: 'Google',
    [PersonSignInProvider.SNOWFLAKE]: 'Snowflake',
    [PersonSignInProvider.DATABRICKS]: 'Databricks',
};

export type SharedCredentialOwner = {
    signIn: PersonSignInProvider;
    owner: { userUuid: string; name: string } | null;
};

export type SharedCredentialOwnerDetails = SharedCredentialOwner & {
    hasSchedules: boolean;
};

export type ApiSharedCredentialOwnerResponse = {
    status: 'ok';
    results: SharedCredentialOwnerDetails | null;
};

export type PersonSignIn = {
    provider: PersonSignInProvider;
    refreshToken: string;
};

/**
 * A person's own sign-in stored as a connection credential: a refresh token
 * that belongs to one human. Service accounts, key pairs, access tokens and
 * runtime identities are not person sign-ins.
 */
export const getPersonSignIn = (
    credentials: CreateWarehouseCredentials,
): PersonSignIn | null => {
    switch (credentials.type) {
        case WarehouseTypes.BIGQUERY: {
            const keyfile = credentials.keyfileContents;
            if (
                credentials.authenticationType !==
                    BigqueryAuthenticationType.ADC &&
                keyfile?.type === 'authorized_user' &&
                typeof keyfile.refresh_token === 'string' &&
                keyfile.refresh_token
            ) {
                return {
                    provider: PersonSignInProvider.GOOGLE,
                    refreshToken: keyfile.refresh_token,
                };
            }
            return null;
        }
        case WarehouseTypes.SNOWFLAKE:
            return credentials.authenticationType ===
                SnowflakeAuthenticationType.SSO && credentials.refreshToken
                ? {
                      provider: PersonSignInProvider.SNOWFLAKE,
                      refreshToken: credentials.refreshToken,
                  }
                : null;
        case WarehouseTypes.DATABRICKS:
            return credentials.authenticationType ===
                DatabricksAuthenticationType.OAUTH_U2M &&
                credentials.refreshToken
                ? {
                      provider: PersonSignInProvider.DATABRICKS,
                      refreshToken: credentials.refreshToken,
                  }
                : null;
        case WarehouseTypes.REDSHIFT:
        case WarehouseTypes.POSTGRES:
        case WarehouseTypes.TRINO:
        case WarehouseTypes.CLICKHOUSE:
        case WarehouseTypes.ATHENA:
        case WarehouseTypes.DUCKDB:
            return null;
        default:
            return assertUnreachable(credentials, 'Unknown warehouse type');
    }
};

export type StoredCredentialOwner = {
    refreshToken: string | null;
    ownerUserUuid: string | null;
};

/**
 * The accountable owner of a person sign-in is the person whose refresh token
 * it is. A token already stored (on this connection, or on the project a
 * preview copies) keeps its recorded owner; a new token belongs to the person
 * saving it. Anything that is not a person sign-in has no owner yet.
 */
export const resolveCredentialOwner = ({
    signIn,
    actorUserUuid,
    stored,
}: {
    signIn: PersonSignIn | null;
    actorUserUuid: string | null;
    stored: StoredCredentialOwner[];
}): string | null => {
    if (!signIn) return null;
    const match = stored.find(
        (candidate) =>
            candidate.ownerUserUuid !== null &&
            candidate.refreshToken === signIn.refreshToken,
    );
    return match?.ownerUserUuid ?? actorUserUuid;
};

export type SharedSignInExpiry = {
    provider: PersonSignInProvider;
    ownerUserUuid: string | null;
    ownerName: string | null;
};

export const getExpiredSharedSignInMessage = (
    expiry: SharedSignInExpiry,
    viewerUserUuid: string | null,
): string => {
    const signIn = PERSON_SIGN_IN_LABELS[expiry.provider];
    if (expiry.ownerUserUuid && expiry.ownerUserUuid === viewerUserUuid) {
        return `Your ${signIn} sign-in for this project's connection has expired. Reconnect it in the project's connection settings.`;
    }
    const name = expiry.ownerName?.trim();
    return name
        ? `This project's connection uses ${name}'s sign-in, which has expired. Ask ${name} or an admin to reconnect.`
        : `This project's connection uses a person's sign-in, which has expired. Ask an admin to reconnect.`;
};
