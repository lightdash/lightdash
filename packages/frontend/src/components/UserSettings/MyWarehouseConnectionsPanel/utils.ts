import {
    DatabricksAuthenticationType,
    WarehouseTypes,
    type UpsertUserWarehouseCredentials,
} from '@lightdash/common';

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
