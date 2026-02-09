import {
    type CreateWarehouseCredentials,
    type DbtProjectConfig,
} from '../types/projects';

function serializeConfig(config: Record<string, unknown>): string {
    return JSON.stringify(config, (_key, value) =>
        value !== null && typeof value === 'object' && !Array.isArray(value)
            ? Object.keys(value as Record<string, unknown>)
                  .sort()
                  .reduce<Record<string, unknown>>((acc, k) => {
                      acc[k] = (value as Record<string, unknown>)[k];
                      return acc;
                  }, {})
            : value,
    );
}

function hasConfigChanged(
    before: Record<string, unknown> | undefined,
    after: Record<string, unknown> | undefined,
): boolean {
    if (before === undefined && after === undefined) return false;
    if (before === undefined || after === undefined) return true;
    return serializeConfig(before) !== serializeConfig(after);
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
    const warehouseChanged = hasConfigChanged(
        before.warehouseConnection as unknown as
            | Record<string, unknown>
            | undefined,
        after.warehouseConnection as unknown as
            | Record<string, unknown>
            | undefined,
    );

    const dbtChanged = hasConfigChanged(
        before.dbtConnection as unknown as Record<string, unknown> | undefined,
        after.dbtConnection as unknown as Record<string, unknown> | undefined,
    );

    return warehouseChanged || dbtChanged;
}
