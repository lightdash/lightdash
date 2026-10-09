import {
    DatabricksAuthenticationType,
    SnowflakeAuthenticationType,
    WarehouseTypes,
    type CreateWarehouseCredentials,
} from '@lightdash/common';
import { preparedCredentials } from './CredentialResolver';

export const prepareWarehouseOAuthCredentials = <
    T extends CreateWarehouseCredentials,
>(
    connection: T,
): T =>
    (connection.type === WarehouseTypes.SNOWFLAKE &&
        connection.authenticationType === SnowflakeAuthenticationType.SSO) ||
    (connection.type === WarehouseTypes.DATABRICKS &&
        (connection.authenticationType ===
            DatabricksAuthenticationType.OAUTH_U2M ||
            connection.authenticationType ===
                DatabricksAuthenticationType.OAUTH_M2M))
        ? { ...connection, [preparedCredentials]: true }
        : connection;
