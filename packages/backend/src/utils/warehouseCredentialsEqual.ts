import {
    DatabricksAuthenticationType,
    normalizeWarehouseCredentials,
    SnowflakeAuthenticationType,
    WarehouseTypes,
    type CreateWarehouseCredentials,
} from '@lightdash/common';
import isEqual from 'lodash/isEqual';
import { stripWarehouseCredentialVersion } from './warehouseCredentialVersion';

const bindingCredentials = (credentials: CreateWarehouseCredentials) => {
    const normalized = normalizeWarehouseCredentials(
        stripWarehouseCredentialVersion(credentials),
    );
    if (
        (normalized.type === WarehouseTypes.SNOWFLAKE &&
            normalized.authenticationType ===
                SnowflakeAuthenticationType.SSO) ||
        (normalized.type === WarehouseTypes.DATABRICKS &&
            (normalized.authenticationType ===
                DatabricksAuthenticationType.OAUTH_U2M ||
                normalized.authenticationType ===
                    DatabricksAuthenticationType.OAUTH_M2M))
    ) {
        const { token, ...binding } = normalized;
        return binding;
    }
    return normalized;
};

export const warehouseCredentialsEqual = (
    current: CreateWarehouseCredentials | null,
    next: CreateWarehouseCredentials,
): boolean => {
    if (!current) return false;
    try {
        return isEqual(
            JSON.parse(JSON.stringify(bindingCredentials(current))),
            JSON.parse(JSON.stringify(bindingCredentials(next))),
        );
    } catch {
        return false;
    }
};
