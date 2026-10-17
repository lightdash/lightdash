import {
    DuckdbConnectionType,
    isUserConnectableWarehouseConnection,
    ParameterError,
    supportsConnectionDatabaseListing,
    WarehouseTypes,
    type CreateWarehouseCredentials,
} from '@lightdash/common';

type ListingSettings = {
    listAllDatabases?: boolean;
    additionalDatabases?: string[];
};

export const assertConnectionDatabaseListing = (
    warehouseType: WarehouseTypes,
    settings: ListingSettings,
): void => {
    if (
        !supportsConnectionDatabaseListing(warehouseType) &&
        (settings.listAllDatabases === true ||
            (settings.additionalDatabases?.length ?? 0) > 0)
    ) {
        throw new ParameterError(
            `Database listing settings are not supported for ${warehouseType} connections.`,
        );
    }
};

export function assertExtraConnectionSettings(
    credentials: CreateWarehouseCredentials,
    settings: ListingSettings,
    mixedTypesEnabled: boolean,
): asserts credentials is Exclude<
    CreateWarehouseCredentials,
    {
        type: WarehouseTypes.DUCKDB;
        connectionType: DuckdbConnectionType.ANALYTICS;
    }
> {
    if (!isUserConnectableWarehouseConnection(credentials)) {
        throw new ParameterError(
            'Internal analytics connections cannot be added as extra connections.',
        );
    }
    if (mixedTypesEnabled) {
        assertConnectionDatabaseListing(credentials.type, settings);
    }
}
