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

export type SignInSubject = { userUuid: string; name: string };

export type PersonSignIn = {
    provider: PersonSignInProvider;
    refreshToken: string;
};

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

export type StoredSignInSubject = {
    refreshToken: string | null;
    subjectUserUuid: string | null;
};

export const resolveSignInSubject = ({
    signIn,
    actorUserUuid,
    stored,
}: {
    signIn: PersonSignIn | null;
    actorUserUuid: string | null;
    stored: StoredSignInSubject[];
}): string | null => {
    if (!signIn) return null;
    const match = stored.find(
        (candidate) =>
            candidate.subjectUserUuid !== null &&
            candidate.refreshToken === signIn.refreshToken,
    );
    return match?.subjectUserUuid ?? actorUserUuid;
};

export type SharedSignInExpiry = {
    provider: PersonSignInProvider;
    subjectUserUuid: string | null;
    subjectName: string | null;
};

export const getExpiredSharedSignInMessage = (
    expiry: SharedSignInExpiry,
    viewerUserUuid: string | null,
): string => {
    const signIn = PERSON_SIGN_IN_LABELS[expiry.provider];
    if (expiry.subjectUserUuid && expiry.subjectUserUuid === viewerUserUuid) {
        return `Your ${signIn} sign-in for this project's connection has expired. Reconnect it in the project's connection settings.`;
    }
    const name = expiry.subjectName?.trim();
    return name
        ? `This project's connection uses ${name}'s sign-in, which has expired. Ask ${name} or an admin to reconnect.`
        : `This project's connection uses a ${signIn} sign-in that has expired. Ask a project admin to reconnect it in Project settings → Connection settings.`;
};
