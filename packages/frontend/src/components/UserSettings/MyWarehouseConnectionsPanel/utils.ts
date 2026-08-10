import {
    DatabricksAuthenticationType,
    WarehouseTypes,
    type UpsertUserWarehouseCredentials,
} from '@lightdash/common';

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
