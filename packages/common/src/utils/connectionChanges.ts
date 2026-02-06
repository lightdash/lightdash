import {
    type CreateWarehouseCredentials,
    type DbtProjectConfig,
} from '../types/projects';

function serializeConfig(config: Record<string, unknown>): string {
    const sorted = Object.keys(config)
        .sort()
        .reduce<Record<string, unknown>>((acc, key) => {
            acc[key] = config[key];
            return acc;
        }, {});
    return JSON.stringify(sorted);
}

export function hasConnectionChanges(
    before: {
        warehouseConnection?: CreateWarehouseCredentials;
        dbtConnection?: DbtProjectConfig;
    },
    after: {
        warehouseConnection?: CreateWarehouseCredentials;
        dbtConnection?: DbtProjectConfig;
    },
): boolean {
    const warehouseChanged =
        before.warehouseConnection !== undefined &&
        after.warehouseConnection !== undefined &&
        serializeConfig(
            before.warehouseConnection as unknown as Record<string, unknown>,
        ) !==
            serializeConfig(
                after.warehouseConnection as unknown as Record<string, unknown>,
            );

    const dbtChanged =
        before.dbtConnection !== undefined &&
        after.dbtConnection !== undefined &&
        serializeConfig(
            before.dbtConnection as unknown as Record<string, unknown>,
        ) !==
            serializeConfig(
                after.dbtConnection as unknown as Record<string, unknown>,
            );

    return warehouseChanged || dbtChanged;
}
