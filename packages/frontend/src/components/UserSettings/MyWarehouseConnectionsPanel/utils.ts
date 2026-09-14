import {
    DatabricksAuthenticationType,
    SnowflakeAuthenticationType,
    WarehouseTypes,
    type UpsertUserWarehouseCredentials,
    type UserWarehouseCredentials,
} from '@lightdash/common';
import { type FormErrors } from '@mantine/form';

/** The private key file input is controlled, so it renders this error itself. */
export const PRIVATE_KEY_FIELD_PATH = 'credentials.privateKey';
const USER_FIELD_PATH = 'credentials.user';
const PASSWORD_FIELD_PATH = 'credentials.password';
const ACCESS_KEY_ID_FIELD_PATH = 'credentials.accessKeyId';
const SECRET_ACCESS_KEY_FIELD_PATH = 'credentials.secretAccessKey';

/**
 * "Sign in with Databricks" (OAuth U2M) is enterprise-only, so instances
 * without it can only use a personal access token.
 */
export const getDefaultDatabricksAuthenticationType = (
    isSsoEnabled: boolean,
): DatabricksAuthenticationType =>
    isSsoEnabled
        ? DatabricksAuthenticationType.OAUTH_U2M
        : DatabricksAuthenticationType.PERSONAL_ACCESS_TOKEN;

/**
 * Databricks personal credentials support both "Sign in with Databricks"
 * (OAuth U2M, enterprise-only) and a personal access token. Unlike the SSO
 * flow, the PAT branch has an editable secret and so needs a save button.
 */
export const isDatabricksPersonalAccessToken = (
    credentials: UpsertUserWarehouseCredentials['credentials'],
) =>
    credentials.type === WarehouseTypes.DATABRICKS &&
    credentials.authenticationType ===
        DatabricksAuthenticationType.PERSONAL_ACCESS_TOKEN;

export const isSnowflakeSso = (
    credentials: UpsertUserWarehouseCredentials['credentials'],
) =>
    credentials.type === WarehouseTypes.SNOWFLAKE &&
    credentials.authenticationType === SnowflakeAuthenticationType.SSO;

/**
 * Instances with Snowflake OAuth configured keep "Sign in with Snowflake" as
 * the default, so enabling password and private key doesn't move them off the
 * flow they already use.
 */
export const getDefaultSnowflakeAuthenticationType = (
    isSsoEnabled: boolean,
): SnowflakeAuthenticationType =>
    isSsoEnabled
        ? SnowflakeAuthenticationType.SSO
        : SnowflakeAuthenticationType.PASSWORD;

/**
 * Reopening a saved credential can't prefill a secret, so every editable
 * Snowflake field is checked here rather than letting the masked placeholder
 * reach the server and come back as an unattributed 400.
 */
export const validateUserWarehouseCredentials = (
    values: UpsertUserWarehouseCredentials,
    existingCredentials?: UserWarehouseCredentials['credentials'],
): FormErrors => {
    const { credentials } = values;
    if (credentials.type === WarehouseTypes.ATHENA) {
        const errors: FormErrors = {};
        const accessKeyId = credentials.accessKeyId?.trim();
        if (!accessKeyId) {
            errors[ACCESS_KEY_ID_FIELD_PATH] = 'Enter your AWS access key ID.';
        }

        const existingAccessKeyId =
            existingCredentials?.type === WarehouseTypes.ATHENA
                ? existingCredentials.accessKeyId
                : undefined;
        if (
            (!existingAccessKeyId || accessKeyId !== existingAccessKeyId) &&
            !credentials.secretAccessKey
        ) {
            errors[SECRET_ACCESS_KEY_FIELD_PATH] =
                'Enter the AWS secret access key for this access key ID.';
        }
        return errors;
    }

    if (credentials.type !== WarehouseTypes.SNOWFLAKE) return {};

    const { authenticationType } = credentials;
    // The OAuth popup owns the SSO credential; nothing here is editable.
    if (authenticationType === SnowflakeAuthenticationType.SSO) return {};

    const errors: FormErrors = {};
    if (!credentials.user.trim()) {
        errors[USER_FIELD_PATH] = 'Enter your Snowflake username or email.';
    }

    if (authenticationType === SnowflakeAuthenticationType.PRIVATE_KEY) {
        const privateKey =
            'privateKey' in credentials ? credentials.privateKey : undefined;
        if (!privateKey) {
            errors[PRIVATE_KEY_FIELD_PATH] =
                'Upload your Snowflake private key file.';
        }
        return errors;
    }

    const password =
        'password' in credentials ? credentials.password : undefined;
    if (!password) {
        errors[PASSWORD_FIELD_PATH] = 'Enter your Snowflake password.';
    }
    return errors;
};
