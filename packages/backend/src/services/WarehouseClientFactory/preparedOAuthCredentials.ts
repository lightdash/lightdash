import {
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
    connection.type === WarehouseTypes.SNOWFLAKE &&
    connection.authenticationType === SnowflakeAuthenticationType.SSO
        ? { ...connection, [preparedCredentials]: true }
        : connection;
