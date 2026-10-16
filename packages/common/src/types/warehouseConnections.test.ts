import { describe, expect, it } from 'vitest';
import { WarehouseTypes } from './projects';
import {
    canUseExtraConnectionWarehouseType,
    MIXED_TYPE_EXTRA_CONNECTION_WAREHOUSE_TYPES,
    supportsMultipleConnections,
} from './warehouseConnections';

describe('canUseExtraConnectionWarehouseType', () => {
    it.each(Object.values(WarehouseTypes))(
        'allows the same type %s with the flag off',
        (warehouseType) => {
            expect(
                canUseExtraConnectionWarehouseType({
                    originalWarehouseType: warehouseType,
                    extraWarehouseType: warehouseType,
                    mixedTypesEnabled: false,
                }),
            ).toBe(true);
        },
    );

    it.each(
        MIXED_TYPE_EXTRA_CONNECTION_WAREHOUSE_TYPES.flatMap(
            (originalWarehouseType) =>
                MIXED_TYPE_EXTRA_CONNECTION_WAREHOUSE_TYPES.map(
                    (extraWarehouseType) => ({
                        originalWarehouseType,
                        extraWarehouseType,
                    }),
                ),
        ),
    )('gates $originalWarehouseType to $extraWarehouseType', (types) => {
        expect(
            canUseExtraConnectionWarehouseType({
                ...types,
                mixedTypesEnabled: true,
            }),
        ).toBe(true);
        expect(
            canUseExtraConnectionWarehouseType({
                ...types,
                mixedTypesEnabled: false,
            }),
        ).toBe(types.originalWarehouseType === types.extraWarehouseType);
    });

    it.each(
        Object.values(WarehouseTypes).filter(
            (type) =>
                !MIXED_TYPE_EXTRA_CONNECTION_WAREHOUSE_TYPES.includes(type),
        ),
    )(
        'refuses unsupported mixed type %s in both directions',
        (warehouseType) => {
            expect(
                canUseExtraConnectionWarehouseType({
                    originalWarehouseType: WarehouseTypes.POSTGRES,
                    extraWarehouseType: warehouseType,
                    mixedTypesEnabled: true,
                }),
            ).toBe(false);
            expect(
                canUseExtraConnectionWarehouseType({
                    originalWarehouseType: warehouseType,
                    extraWarehouseType: WarehouseTypes.TRINO,
                    mixedTypesEnabled: true,
                }),
            ).toBe(false);
        },
    );

    it('refuses a missing original type', () => {
        expect(
            canUseExtraConnectionWarehouseType({
                originalWarehouseType: null,
                extraWarehouseType: WarehouseTypes.TRINO,
                mixedTypesEnabled: true,
            }),
        ).toBe(false);
    });
});

describe('supportsMultipleConnections', () => {
    it('supports a Trino primary', () => {
        expect(supportsMultipleConnections(WarehouseTypes.TRINO)).toBe(true);
    });
    it('refuses a missing or unsupported primary', () => {
        expect(supportsMultipleConnections(null)).toBe(false);
        expect(supportsMultipleConnections(WarehouseTypes.BIGQUERY)).toBe(
            false,
        );
    });
});
