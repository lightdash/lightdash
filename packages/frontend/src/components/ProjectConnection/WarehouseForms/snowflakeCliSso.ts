import { type WarehouseConnectInventory } from '@lightdash/common';

export const SNOWFLAKE_CLI_INSTALL_COMMAND = 'npm install -g @lightdash/cli';

const WAREHOUSE_SIZE_ORDER = [
    'X-Small',
    'Small',
    'Medium',
    'Large',
    'X-Large',
    '2X-Large',
    '3X-Large',
    '4X-Large',
    '5X-Large',
    '6X-Large',
];

const sizeRank = (size: string | null): number => {
    if (!size) return Number.MAX_SAFE_INTEGER;
    const index = WAREHOUSE_SIZE_ORDER.findIndex(
        (candidate) => candidate.toLowerCase() === size.trim().toLowerCase(),
    );
    return index === -1 ? Number.MAX_SAFE_INTEGER : index;
};

const isStarted = (state: string | null): boolean =>
    (state ?? '').trim().toUpperCase() === 'STARTED';

export const warehouseSecondaryText = (
    warehouse: WarehouseConnectInventory['warehouses'][number],
): string | null => {
    const parts: string[] = [];
    if (warehouse.size) parts.push(warehouse.size);
    if (warehouse.state) parts.push(warehouse.state.toLowerCase());
    return parts.length > 0 ? parts.join(' · ') : null;
};

export const recommendedWarehouseName = (
    warehouses: WarehouseConnectInventory['warehouses'],
): string | null => {
    let best: WarehouseConnectInventory['warehouses'][number] | null = null;
    warehouses.forEach((warehouse) => {
        if (best === null) {
            best = warehouse;
            return;
        }
        const candidateRank = sizeRank(warehouse.size);
        const bestRank = sizeRank(best.size);
        if (candidateRank < bestRank) {
            best = warehouse;
        } else if (
            candidateRank === bestRank &&
            isStarted(warehouse.state) &&
            !isStarted(best.state)
        ) {
            best = warehouse;
        }
    });
    return best === null
        ? null
        : (best as WarehouseConnectInventory['warehouses'][number]).name;
};

export const buildSnowflakeConnectCommand = ({
    siteUrl,
    code,
    account,
    dev = false,
}: {
    siteUrl: string;
    code: string;
    account: string;
    dev?: boolean;
}): string => {
    const cli = dev ? 'pnpm -F cli exec tsx src/index.ts' : 'lightdash';
    return `${cli} connect-snowflake --url ${siteUrl} --code ${code} --account ${account}`;
};
