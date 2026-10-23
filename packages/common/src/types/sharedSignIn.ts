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

export type SharedSignInStatus = {
    provider: PersonSignInProvider;
    subject: SignInSubject | null;
    subjectBasis: SignInSubjectBasis | null;
    expired: boolean;
    canReconnect: boolean;
    statusUnknown?: boolean;
    personalSelection?: { warehouseConnectionUuid: string | null };
    personalSignIn?: PersonalSignInExpiry & {
        expired: boolean;
        canReconnect: boolean;
    };
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
    projectUuid: string;
    provider: PersonSignInProvider;
    subjectUserUuid: string | null;
    subjectName: string | null;
    subjectBasis: SignInSubjectBasis | null;
};

export type PersonalSignInExpiry = {
    projectUuid: string;
    provider: PersonSignInProvider;
    userWarehouseCredentialsUuid: string;
};

export const getExpiredPersonalSignInMessage = (
    expiry: Pick<PersonalSignInExpiry, 'provider'>,
): string => {
    const provider = PERSON_SIGN_IN_LABELS[expiry.provider];
    const warehouse =
        expiry.provider === PersonSignInProvider.GOOGLE ? 'BigQuery' : provider;
    return `Your ${warehouse} sign-in has expired. Sign in with ${provider} again to load this.`;
};

export const getExpiredSharedSignInMessage = (
    expiry: Omit<SharedSignInExpiry, 'projectUuid'>,
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

export const getWarehouseSignInErrorType = (
    message: string,
): {
    name:
        | 'BigqueryTokenError'
        | 'SnowflakeTokenError'
        | 'DatabricksTokenError'
        | 'WarehouseSignInExpiredError';
    scope: 'personal' | 'shared';
    provider: PersonSignInProvider | null;
} | null => {
    const names = {
        [PersonSignInProvider.GOOGLE]: 'BigqueryTokenError',
        [PersonSignInProvider.SNOWFLAKE]: 'SnowflakeTokenError',
        [PersonSignInProvider.DATABRICKS]: 'DatabricksTokenError',
    } as const;
    for (const provider of Object.values(PersonSignInProvider)) {
        if (message === getExpiredPersonalSignInMessage({ provider }))
            return { name: names[provider], scope: 'personal', provider };
        const subjectUserUuid = 'subject';
        const base = { provider, subjectUserUuid, subjectName: null };
        if (
            message ===
                getExpiredSharedSignInMessage(
                    { ...base, subjectBasis: null },
                    null,
                ) ||
            [
                SignInSubjectBasis.RECORDED,
                SignInSubjectBasis.PROJECT_CREATOR,
            ].some(
                (subjectBasis) =>
                    message ===
                    getExpiredSharedSignInMessage(
                        { ...base, subjectBasis },
                        subjectUserUuid,
                    ),
            )
        )
            return {
                name: 'WarehouseSignInExpiredError',
                scope: 'shared',
                provider,
            };
        const templates = [
            {
                subjectBasis: SignInSubjectBasis.RECORDED,
                prefix: "This project's connection uses ",
                separator: "'s sign-in, which has expired. Ask ",
            },
            {
                subjectBasis: SignInSubjectBasis.PROJECT_CREATOR,
                prefix: `This project's ${PERSON_SIGN_IN_LABELS[provider]} sign-in has expired. `,
                separator:
                    ' created this project. Ask them or a project admin to reconnect it in Project settings → Connection settings.',
            },
        ];
        for (const { subjectBasis, prefix, separator } of templates) {
            const end = message.indexOf(separator, prefix.length);
            if (message.startsWith(prefix) && end > prefix.length) {
                const subjectName = message.slice(prefix.length, end);
                if (
                    message ===
                    getExpiredSharedSignInMessage(
                        { ...base, subjectName, subjectBasis },
                        'viewer',
                    )
                )
                    return {
                        name: 'WarehouseSignInExpiredError',
                        scope: 'shared',
                        provider:
                            subjectBasis === SignInSubjectBasis.RECORDED
                                ? null
                                : provider,
                    };
            }
        }
    }
    return null;
};
