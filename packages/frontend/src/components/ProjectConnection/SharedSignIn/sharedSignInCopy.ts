import {
    AthenaAuthenticationType,
    assertUnreachable,
    BigqueryAuthenticationType,
    DatabricksAuthenticationType,
    DuckdbConnectionType,
    getExpiredSharedSignInMessage,
    PERSON_SIGN_IN_LABELS,
    RedshiftAuthenticationType,
    type PersonSignInProvider,
    SignInSubjectBasis,
    SnowflakeAuthenticationType,
    WarehouseTypes,
    type ApiErrorDetail,
    type SharedSignIn,
    type SharedSignInExpiry,
    type SharedSignInStatus,
    type CreateWarehouseCredentials,
    WAREHOUSE_TYPES_WITH_OPTIONAL_USER_CREDENTIALS,
} from '@lightdash/common';

export const getSetupLine = (provider: PersonSignInProvider) =>
    `Teammates sign in with their own ${PERSON_SIGN_IN_LABELS[provider]} account. Add a service account for schedules and shared work.`;

export const SHARED_SIGN_IN_REFUSAL_MESSAGE =
    'A shared connection can only use a service account. Sign in with your own account under your warehouse connections, or add a service account.';

const getSubjectName = (subject: SharedSignIn['subject']) =>
    subject?.name.trim() || null;

export const getRunsAsLabel = (sharedSignIn: SharedSignIn): string => {
    const signIn = PERSON_SIGN_IN_LABELS[sharedSignIn.provider];
    const name = getSubjectName(sharedSignIn.subject);
    if (sharedSignIn.subjectBasis === SignInSubjectBasis.PROJECT_CREATOR) {
        return name
            ? `Runs as a person's ${signIn} sign-in. ${name} created this project.`
            : `Runs as a person's ${signIn} sign-in.`;
    }
    return name && sharedSignIn.subjectBasis === SignInSubjectBasis.RECORDED
        ? `Runs as ${name}'s ${signIn} sign-in.`
        : `Runs as a person's ${signIn} sign-in.`;
};

const dateFormat = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
});

export const getStopsWorkingLabel = (stopsWorkingOn: string | null) =>
    stopsWorkingOn
        ? `This stops working on ${dateFormat.format(new Date(stopsWorkingOn))}.`
        : 'This will stop working. A shared credential can only be a service account.';

export type ServiceMethod = {
    authenticationType:
        | AthenaAuthenticationType
        | BigqueryAuthenticationType
        | DatabricksAuthenticationType
        | RedshiftAuthenticationType
        | SnowflakeAuthenticationType;
    label: string;
    needsLongLivedKey: boolean;
};

const SERVICE_METHODS: Partial<Record<WarehouseTypes, ServiceMethod[]>> = {
    [WarehouseTypes.BIGQUERY]: [
        {
            authenticationType: BigqueryAuthenticationType.PRIVATE_KEY,
            label: 'Service account key file',
            needsLongLivedKey: true,
        },
    ],
    [WarehouseTypes.SNOWFLAKE]: [
        {
            authenticationType: SnowflakeAuthenticationType.PRIVATE_KEY,
            label: 'Key pair',
            needsLongLivedKey: true,
        },
    ],
    [WarehouseTypes.DATABRICKS]: [
        {
            authenticationType: DatabricksAuthenticationType.OAUTH_M2M,
            label: 'Service principal (OAuth M2M)',
            needsLongLivedKey: true,
        },
    ],
    [WarehouseTypes.ATHENA]: [
        {
            authenticationType: AthenaAuthenticationType.ACCESS_KEY,
            label: 'Access keys',
            needsLongLivedKey: true,
        },
        {
            authenticationType: AthenaAuthenticationType.IAM_ROLE,
            label: 'IAM role with assume-role',
            needsLongLivedKey: false,
        },
    ],
    [WarehouseTypes.REDSHIFT]: [
        {
            authenticationType: RedshiftAuthenticationType.IAM,
            label: 'AWS IAM',
            needsLongLivedKey: false,
        },
    ],
};

export const getServiceMethods = (
    warehouseType: WarehouseTypes,
): ServiceMethod[] =>
    [...(SERVICE_METHODS[warehouseType] ?? [])].sort(
        (a, b) => Number(a.needsLongLivedKey) - Number(b.needsLongLivedKey),
    );

export const canUseServiceCredentialForPeople = (
    warehouseType: WarehouseTypes,
): boolean =>
    WAREHOUSE_TYPES_WITH_OPTIONAL_USER_CREDENTIALS.includes(warehouseType);

export const isPersonSignInMethod = (
    credentials: CreateWarehouseCredentials,
): boolean => {
    switch (credentials.type) {
        case WarehouseTypes.BIGQUERY:
            return (
                credentials.authenticationType ===
                BigqueryAuthenticationType.SSO
            );
        case WarehouseTypes.SNOWFLAKE:
            return (
                credentials.authenticationType ===
                    SnowflakeAuthenticationType.SSO ||
                credentials.authenticationType ===
                    SnowflakeAuthenticationType.EXTERNAL_BROWSER
            );
        case WarehouseTypes.DATABRICKS:
            return (
                credentials.authenticationType ===
                DatabricksAuthenticationType.OAUTH_U2M
            );
        case WarehouseTypes.REDSHIFT:
            return (
                credentials.authenticationType ===
                RedshiftAuthenticationType.IAM_BROWSER
            );
        case WarehouseTypes.POSTGRES:
        case WarehouseTypes.TRINO:
        case WarehouseTypes.CLICKHOUSE:
        case WarehouseTypes.ATHENA:
        case WarehouseTypes.DUCKDB:
            return false;
        default:
            return assertUnreachable(credentials, 'Unknown warehouse type');
    }
};

const isServiceCredentialMethod = (
    credentials: CreateWarehouseCredentials,
): boolean => {
    switch (credentials.type) {
        case WarehouseTypes.BIGQUERY: {
            const authenticationType = credentials.authenticationType;
            switch (authenticationType) {
                case BigqueryAuthenticationType.PRIVATE_KEY:
                case BigqueryAuthenticationType.ADC:
                case undefined:
                    return true;
                case BigqueryAuthenticationType.SSO:
                    return false;
                default:
                    return assertUnreachable(
                        authenticationType,
                        'Unknown BigQuery authentication type',
                    );
            }
        }
        case WarehouseTypes.SNOWFLAKE: {
            const authenticationType = credentials.authenticationType;
            switch (authenticationType) {
                case SnowflakeAuthenticationType.PASSWORD:
                case SnowflakeAuthenticationType.PRIVATE_KEY:
                case undefined:
                    return true;
                case SnowflakeAuthenticationType.SSO:
                case SnowflakeAuthenticationType.EXTERNAL_BROWSER:
                case SnowflakeAuthenticationType.OAUTH_AUTHORIZATION_CODE:
                case SnowflakeAuthenticationType.NONE:
                    return false;
                default:
                    return assertUnreachable(
                        authenticationType,
                        'Unknown Snowflake authentication type',
                    );
            }
        }
        case WarehouseTypes.DATABRICKS: {
            const authenticationType = credentials.authenticationType;
            switch (authenticationType) {
                case DatabricksAuthenticationType.PERSONAL_ACCESS_TOKEN:
                case DatabricksAuthenticationType.OAUTH_M2M:
                case undefined:
                    return true;
                case DatabricksAuthenticationType.OAUTH_U2M:
                    return false;
                default:
                    return assertUnreachable(
                        authenticationType,
                        'Unknown Databricks authentication type',
                    );
            }
        }
        case WarehouseTypes.REDSHIFT: {
            const authenticationType = credentials.authenticationType;
            switch (authenticationType) {
                case RedshiftAuthenticationType.PASSWORD:
                case RedshiftAuthenticationType.IAM:
                case undefined:
                    return true;
                case RedshiftAuthenticationType.IAM_BROWSER:
                    return false;
                default:
                    return assertUnreachable(
                        authenticationType,
                        'Unknown Redshift authentication type',
                    );
            }
        }
        case WarehouseTypes.ATHENA: {
            const authenticationType = credentials.authenticationType;
            switch (authenticationType) {
                case AthenaAuthenticationType.ACCESS_KEY:
                case AthenaAuthenticationType.IAM_ROLE:
                case undefined:
                    return true;
                default:
                    return assertUnreachable(
                        authenticationType,
                        'Unknown Athena authentication type',
                    );
            }
        }
        case WarehouseTypes.DUCKDB:
            return (
                credentials.connectionType !== DuckdbConnectionType.ANALYTICS
            );
        case WarehouseTypes.POSTGRES:
        case WarehouseTypes.TRINO:
        case WarehouseTypes.CLICKHOUSE:
            return true;
        default:
            return assertUnreachable(credentials, 'Unknown warehouse type');
    }
};

export const shouldOfferFirstServiceCredentialChoice = (
    credentials: CreateWarehouseCredentials,
    flagEnabled: boolean,
    hasSavedProject: boolean,
    hasServiceAccount: boolean | undefined,
): boolean =>
    flagEnabled &&
    (!hasSavedProject || hasServiceAccount === false) &&
    isServiceCredentialMethod(credentials);

export const getSchedulePrompt = (
    sharedSignIn: SharedSignIn | null,
    currentUserUuid: string | undefined,
) => {
    const subject = sharedSignIn?.subject ?? null;
    const runsOn =
        !sharedSignIn ||
        (sharedSignIn.subjectBasis === SignInSubjectBasis.RECORDED &&
            !!subject?.userUuid &&
            subject?.userUuid === currentUserUuid)
            ? 'your own sign-in'
            : sharedSignIn.subjectBasis === SignInSubjectBasis.RECORDED &&
                getSubjectName(subject)
              ? `${getSubjectName(subject)}'s ${PERSON_SIGN_IN_LABELS[sharedSignIn.provider]} sign-in`
              : `this project's shared ${PERSON_SIGN_IN_LABELS[sharedSignIn.provider]} sign-in`;
    return `This schedule runs on ${runsOn}. If it expires, the schedule stops. Add a service account to keep it running.`;
};

export const getSharedSignInExpiry = (
    apiError: Pick<ApiErrorDetail, 'data'>,
): SharedSignInExpiry | null => {
    const sharedSignIn: unknown = apiError.data?.sharedSignIn;
    return sharedSignIn && typeof sharedSignIn === 'object'
        ? (sharedSignIn as SharedSignInExpiry)
        : null;
};

export const shouldOpenSharedSignInReconnectModal = (
    status: SharedSignInStatus | null,
): status is SharedSignInStatus =>
    status?.expired === true && status.canReconnect;

export const isSharedSignInModalError = (
    error: Pick<ApiErrorDetail, 'data' | 'message'>,
    status: SharedSignInStatus,
    viewerUserUuid: string | null,
): boolean => {
    const expiry = getSharedSignInExpiry(error);
    return (
        (expiry?.provider === status.provider &&
            expiry.subjectUserUuid === (status.subject?.userUuid ?? null) &&
            expiry.subjectBasis === status.subjectBasis) ||
        error.message ===
            getExpiredSharedSignInMessage(
                {
                    provider: status.provider,
                    subjectUserUuid: status.subject?.userUuid ?? null,
                    subjectName: status.subject?.name ?? null,
                    subjectBasis: status.subjectBasis,
                },
                viewerUserUuid,
            )
    );
};
