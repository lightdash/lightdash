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

export enum SignInSubjectBasis {
    RECORDED = 'recorded',
    PROJECT_CREATOR = 'project_creator',
}

export const PERSON_SIGN_IN_LABELS: Record<PersonSignInProvider, string> = {
    [PersonSignInProvider.GOOGLE]: 'Google',
    [PersonSignInProvider.SNOWFLAKE]: 'Snowflake',
    [PersonSignInProvider.DATABRICKS]: 'Databricks',
};

export type SignInSubject = { userUuid: string; name: string };

export type SharedSignIn = {
    provider: PersonSignInProvider;
    subject: SignInSubject | null;
    subjectBasis: SignInSubjectBasis | null;
};

export type WarehouseCredentialSummary = {
    sharedSignIn: SharedSignIn | null;
};

export type ApiWarehouseCredentialSummaryResponse = {
    status: 'ok';
    results: WarehouseCredentialSummary;
};

export type SharedSignInStatus = {
    provider: PersonSignInProvider;
    subject: SignInSubject | null;
    subjectBasis: SignInSubjectBasis | null;
    expired: boolean;
    canReconnect: boolean;
};

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
        (candidate) => candidate.refreshToken === signIn.refreshToken,
    );
    return match ? match.subjectUserUuid : actorUserUuid;
};

export type SharedSignInExpiry = {
    provider: PersonSignInProvider;
    subjectUserUuid: string | null;
    subjectName: string | null;
    subjectBasis: SignInSubjectBasis | null;
};

export const getExpiredSharedSignInMessage = (
    expiry: SharedSignInExpiry,
    viewerUserUuid: string | null,
): string => {
    const signIn = PERSON_SIGN_IN_LABELS[expiry.provider];
    const name = expiry.subjectName?.trim();
    const nobodyMessage = `This project's connection uses a ${signIn} sign-in that has expired. Ask a project admin to reconnect it in Project settings → Connection settings.`;
    if (viewerUserUuid === null) return nobodyMessage;
    switch (expiry.subjectBasis) {
        case SignInSubjectBasis.RECORDED:
            if (expiry.subjectUserUuid === viewerUserUuid) {
                return `Your ${signIn} sign-in for this project's connection has expired. Reconnect it in the project's connection settings.`;
            }
            return name
                ? `This project's connection uses ${name}'s sign-in, which has expired. Ask ${name} or an admin to reconnect.`
                : nobodyMessage;
        case SignInSubjectBasis.PROJECT_CREATOR:
            if (expiry.subjectUserUuid === viewerUserUuid) {
                return `This project's ${signIn} sign-in has expired. You created this project. Reconnect it in Project settings → Connection settings.`;
            }
            return name
                ? `This project's ${signIn} sign-in has expired. ${name} created this project. Ask them or a project admin to reconnect it in Project settings → Connection settings.`
                : nobodyMessage;
        case null:
            return nobodyMessage;
        default:
            return assertUnreachable(
                expiry.subjectBasis,
                'Unknown sign-in subject basis',
            );
    }
};
