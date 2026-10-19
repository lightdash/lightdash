import { describe, expect, it } from 'vitest';
import {
    DuckdbConnectionType,
    DucklakeCatalogType,
    DucklakeDataPathType,
    WarehouseTypes,
} from './projects';
import {
    canUseExtraConnectionWarehouseType,
    isUserConnectableWarehouseConnection,
    MULTI_CONNECTION_WAREHOUSE_TYPES,
    supportsConnectionDatabaseListing,
    supportsMultipleConnections,
} from './warehouseConnections';

const types = Object.values(WarehouseTypes);
const mainAllowsExtra = (
    original: WarehouseTypes | null,
    extra: WarehouseTypes,
) =>
    original === extra &&
    (original === WarehouseTypes.POSTGRES ||
        original === WarehouseTypes.ATHENA ||
        original === WarehouseTypes.SNOWFLAKE);

describe('canUseExtraConnectionWarehouseType', () => {
    it.each(
        types.flatMap((originalWarehouseType) =>
            types.map((extraWarehouseType) => ({
                originalWarehouseType,
                extraWarehouseType,
            })),
        ),
    )('gates $originalWarehouseType to $extraWarehouseType', (pair) => {
        expect(
            canUseExtraConnectionWarehouseType({
                ...pair,
                mixedTypesEnabled: true,
            }),
        ).toBe(true);
        expect(
            canUseExtraConnectionWarehouseType({
                ...pair,
                mixedTypesEnabled: false,
            }),
        ).toBe(
            mainAllowsExtra(
                pair.originalWarehouseType,
                pair.extraWarehouseType,
            ),
        );
    });

    it.each([true, false])(
        'refuses a missing original with mixed types %s',
        (mixedTypesEnabled) => {
            expect(
                canUseExtraConnectionWarehouseType({
                    originalWarehouseType: null,
                    extraWarehouseType: WarehouseTypes.TRINO,
                    mixedTypesEnabled,
                }),
            ).toBe(false);
        },
    );
});

describe('supportsMultipleConnections', () => {
    it('preserves the exported original allowlist', () => {
        expect([...MULTI_CONNECTION_WAREHOUSE_TYPES].sort()).toEqual(
            [
                WarehouseTypes.POSTGRES,
                WarehouseTypes.ATHENA,
                WarehouseTypes.SNOWFLAKE,
            ].sort(),
        );
    });
    it.each(types)('supports user connections of type %s', (type) => {
        expect(supportsMultipleConnections(type, true)).toBe(true);
        expect(supportsMultipleConnections(type, false)).toBe(
            mainAllowsExtra(type, type),
        );
    });
    it('requires an original connection', () => {
        expect(supportsMultipleConnections(null, false)).toBe(false);
    });
});

describe('isUserConnectableWarehouseConnection', () => {
    it.each([
        {
            type: WarehouseTypes.DUCKDB,
            connectionType: DuckdbConnectionType.MOTHERDUCK,
            database: 'db',
            schema: 'main',
        },
        {
            type: WarehouseTypes.DUCKDB,
            connectionType: DuckdbConnectionType.DUCKLAKE,
            catalog: { type: DucklakeCatalogType.DUCKDB, path: 'catalog.db' },
            dataPath: { type: DucklakeDataPathType.LOCAL, path: 'data' },
            schema: 'main',
        },
    ] as const)('allows $connectionType', (credentials) => {
        expect(isUserConnectableWarehouseConnection(credentials)).toBe(true);
    });
    it.each([
        {
            type: WarehouseTypes.DUCKDB,
            connectionType: DuckdbConnectionType.ANALYTICS,
            database: 'memory',
            schema: 'main',
        },
        {
            type: WarehouseTypes.DUCKDB,
            connectionType: DuckdbConnectionType.EMBEDDED,
            dataset: 'jaffle',
        },
    ] as const)('refuses backend-managed $connectionType', (credentials) => {
        expect(isUserConnectableWarehouseConnection(credentials)).toBe(false);
    });
});

describe('supportsConnectionDatabaseListing', () => {
    it.each(types)('keeps database listing support for %s', (type) => {
        expect(supportsConnectionDatabaseListing(type)).toBe(
            type === WarehouseTypes.POSTGRES || type === WarehouseTypes.ATHENA,
        );
    });
});
