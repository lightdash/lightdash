import {
    WarehouseTypes,
    type CreateWarehouseCredentials,
    type CreateWarehouseCredentialsWithOptionalSecrets,
    type WarehouseCredentials,
} from './projects';
import { type UserWarehouseCredentials } from './userWarehouseCredentials';

export const MULTI_CONNECTION_WAREHOUSE_TYPES: WarehouseTypes[] = [
    WarehouseTypes.POSTGRES,
    WarehouseTypes.ATHENA,
];

export const supportsMultipleConnections = (
    warehouseType: WarehouseTypes | null,
): boolean =>
    warehouseType !== null &&
    MULTI_CONNECTION_WAREHOUSE_TYPES.includes(warehouseType);

export const WAREHOUSE_CONNECTION_NAME_MAX_LENGTH = 100;

export const WAREHOUSE_CONNECTION_NAME_CONFLICT_MESSAGE =
    'A connection with this name already exists in this project.';

export const validateWarehouseConnectionName = (
    name: string,
): string | null => {
    const trimmedName = name.trim();
    if (trimmedName.length === 0) return 'Enter a name';
    if (trimmedName.length > WAREHOUSE_CONNECTION_NAME_MAX_LENGTH) {
        return `Name must be ${WAREHOUSE_CONNECTION_NAME_MAX_LENGTH} characters or fewer`;
    }
    return null;
};

export type WarehouseConnection = {
    warehouseConnectionUuid: string;
    projectUuid: string;
    name: string;
    isOriginal: boolean;
    warehouseType: WarehouseTypes;
    organizationWarehouseCredentialsUuid: string | null;
    listAllDatabases: boolean;
    additionalDatabases: string[];
    createdAt: Date;
    updatedAt: Date;
};

export type WarehouseConnectionWithCredentials = WarehouseConnection & {
    warehouseConnection: WarehouseCredentials | null;
};

export type WarehouseConnectionCapabilities = {
    canAddConnection: boolean;
    reason: string | null;
};

export type ApiWarehouseConnectionsResponse = {
    status: 'ok';
    results: {
        connections: WarehouseConnection[];
        capabilities: WarehouseConnectionCapabilities;
    };
};

export type ApiWarehouseConnectionResponse = {
    status: 'ok';
    results: WarehouseConnection;
};

export type ApiWarehouseConnectionWithCredentialsResponse = {
    status: 'ok';
    results: WarehouseConnectionWithCredentials;
};

export type ApiCreateWarehouseConnectionRequest = {
    name: string;
    warehouseConnection?: CreateWarehouseCredentials;
    organizationWarehouseCredentialsUuid?: string;
    listAllDatabases?: boolean;
    additionalDatabases?: string[];
};

export type ApiUpdateWarehouseConnectionRequest = {
    warehouseConnection?: CreateWarehouseCredentialsWithOptionalSecrets;
    organizationWarehouseCredentialsUuid?: string;
    listAllDatabases?: boolean;
    additionalDatabases?: string[];
};

export type ApiRenameWarehouseConnectionRequest = {
    name: string;
};

export type WarehouseConnectionUserCredentials = {
    warehouseConnectionUuid: string;
    warehouseType: WarehouseTypes;
    requireUserCredentials: boolean;
    allowsOptionalUserCredentials: boolean;
    userWarehouseCredentials: UserWarehouseCredentials | null;
};

export type ApiWarehouseConnectionUserCredentialsResponse = {
    status: 'ok';
    results: WarehouseConnectionUserCredentials;
};
