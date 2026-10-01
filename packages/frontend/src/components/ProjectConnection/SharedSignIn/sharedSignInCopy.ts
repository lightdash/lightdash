import {
    AthenaAuthenticationType,
    BigqueryAuthenticationType,
    DatabricksAuthenticationType,
    PERSON_SIGN_IN_LABELS,
    SnowflakeAuthenticationType,
    WarehouseTypes,
    type SharedCredentialOwner,
} from '@lightdash/common';

export const SHARED_SIGN_IN_SETUP_LINE =
    'Everyone in this project will query as you. You can add a service account later.';

export const getOwnerName = (owner: SharedCredentialOwner['owner']) =>
    owner?.name.trim() || null;

export const getRunsAsLabel = (credentialOwner: SharedCredentialOwner) => {
    const signIn = PERSON_SIGN_IN_LABELS[credentialOwner.signIn];
    const name = getOwnerName(credentialOwner.owner);
    return name
        ? `Runs as ${name}'s ${signIn} sign-in`
        : `Runs as a person's ${signIn} sign-in`;
};

export type ServiceMethod = {
    authenticationType: string;
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

export const getFirstSchedulePrompt = (
    credentialOwner: SharedCredentialOwner,
) => {
    const signIn = PERSON_SIGN_IN_LABELS[credentialOwner.signIn];
    const name = getOwnerName(credentialOwner.owner);
    const whose = name ? `${name}'s` : `a person's`;
    return `This schedule runs on ${whose} ${signIn} sign-in. If that sign-in expires, the schedule stops. Add a service account to keep it running.`;
};
