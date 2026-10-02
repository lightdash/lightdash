import {
    AthenaAuthenticationType,
    BigqueryAuthenticationType,
    DatabricksAuthenticationType,
    getExpiredSharedSignInMessage,
    PERSON_SIGN_IN_LABELS,
    type PersonSignInProvider,
    SignInSubjectBasis,
    SnowflakeAuthenticationType,
    WarehouseTypes,
    type ApiErrorDetail,
    type SharedSignIn,
    type SharedSignInExpiry,
    type SharedSignInStatus,
} from '@lightdash/common';

export const getSetupLine = (provider: PersonSignInProvider) =>
    `Teammates sign in with their own ${PERSON_SIGN_IN_LABELS[provider]} account. Add a service account for schedules and shared work.`;

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
};

export const getServiceMethods = (
    warehouseType: WarehouseTypes,
): ServiceMethod[] =>
    [...(SERVICE_METHODS[warehouseType] ?? [])].sort(
        (a, b) => Number(a.needsLongLivedKey) - Number(b.needsLongLivedKey),
    );

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
