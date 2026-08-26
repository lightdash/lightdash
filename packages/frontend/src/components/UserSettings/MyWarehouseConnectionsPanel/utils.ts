import {
    DatabricksAuthenticationType,
    SnowflakeAuthenticationType,
    WarehouseTypes,
    type UpsertUserWarehouseCredentials,
} from '@lightdash/common';
import { type FormErrors } from '@mantine/form';

/** The private key file input is controlled, so it renders this error itself. */
export const PRIVATE_KEY_FIELD_PATH = 'credentials.privateKey';

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
 * A private key is write-only: reopening a saved credential can't prefill the
 * file, so saving without re-uploading would persist an empty key.
 */
export const validateUserWarehouseCredentials = (
    values: UpsertUserWarehouseCredentials,
): FormErrors => {
    const { credentials } = values;
    if (
        credentials.type === WarehouseTypes.SNOWFLAKE &&
        credentials.authenticationType ===
            SnowflakeAuthenticationType.PRIVATE_KEY
    ) {
        const privateKey =
            'privateKey' in credentials ? credentials.privateKey : undefined;
        if (!privateKey) {
            return {
                [PRIVATE_KEY_FIELD_PATH]:
                    'Upload your Snowflake private key file.',
            };
        }
    }
    return {};
};
