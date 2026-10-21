import {
    DuckdbConnectionType,
    sensitiveCredentialsFieldNames,
    stripDucklakeNestedSensitive,
    WarehouseTypes,
    type CreateWarehouseCredentials,
    type WarehouseCredentials,
} from '@lightdash/common';
import { stripWarehouseCredentialVersion } from './warehouseCredentialVersion';

export function stripSensitiveWarehouseCredentials(
    credentials: CreateWarehouseCredentials,
): WarehouseCredentials {
    const strippedCredentials: Record<string, unknown> = {
        ...stripWarehouseCredentialVersion(credentials),
    };
    sensitiveCredentialsFieldNames.forEach((field) => {
        delete strippedCredentials[field];
    });
    if (
        credentials.type === WarehouseTypes.DUCKDB &&
        credentials.connectionType === DuckdbConnectionType.DUCKLAKE
    ) {
        return stripDucklakeNestedSensitive(
            strippedCredentials as CreateWarehouseCredentials & {
                type: WarehouseTypes.DUCKDB;
                connectionType: DuckdbConnectionType.DUCKLAKE;
            },
        ) as WarehouseCredentials;
    }
    return strippedCredentials as WarehouseCredentials;
}
