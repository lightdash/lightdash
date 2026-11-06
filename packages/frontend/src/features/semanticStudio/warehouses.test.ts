import { WarehouseTypes } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    canAddWarehouse,
    warehouseMenuItem,
    type StudioWarehouses,
} from './warehouses';

const base = {
    canManage: true,
    mode: 'multiple' as const,
    capabilities: { canAddConnection: true, reason: null },
    availability: undefined,
    originalWarehouseType: WarehouseTypes.POSTGRES,
    mixedTypesEnabled: false,
};

describe('canAddWarehouse', () => {
    it('adds another connection when the backend allows it', () => {
        expect(canAddWarehouse(base)).toBe(true);
        expect(
            canAddWarehouse({
                ...base,
                capabilities: { canAddConnection: false, reason: 'No' },
            }),
        ).toBe(false);
    });

    it('switches a project on one connection when it can', () => {
        const single = { ...base, mode: 'single' as const };
        expect(
            canAddWarehouse({
                ...single,
                availability: {
                    canSwitch: true,
                    reason: null,
                    originalWarehouseType: WarehouseTypes.POSTGRES,
                },
            }),
        ).toBe(true);
        expect(canAddWarehouse(single)).toBe(false);
    });

    it('needs manage Project and a warehouse type that supports extras', () => {
        expect(canAddWarehouse({ ...base, canManage: false })).toBe(false);
        expect(
            canAddWarehouse({
                ...base,
                originalWarehouseType: WarehouseTypes.BIGQUERY,
            }),
        ).toBe(false);
        expect(
            canAddWarehouse({
                ...base,
                originalWarehouseType: WarehouseTypes.BIGQUERY,
                mixedTypesEnabled: true,
            }),
        ).toBe(true);
    });
});

describe('warehouseMenuItem', () => {
    const warehouses: StudioWarehouses = {
        connections: [],
        mode: 'multiple',
        originalWarehouseType: WarehouseTypes.POSTGRES,
        canManage: true,
        canAdd: true,
        reason: null,
    };

    it('keeps today’s greyed-out Warehouse with the flag off', () => {
        expect(
            warehouseMenuItem({
                hasWarehouse: true,
                canAddWithoutWarehouse: true,
                warehouses: null,
            }),
        ).toEqual({ listed: true, disabled: true, inPlace: false });
        expect(
            warehouseMenuItem({
                hasWarehouse: false,
                canAddWithoutWarehouse: true,
                warehouses: null,
            }),
        ).toEqual({ listed: true, disabled: false, inPlace: false });
    });

    it('adds another warehouse in place with the flag on', () => {
        expect(
            warehouseMenuItem({
                hasWarehouse: true,
                canAddWithoutWarehouse: true,
                warehouses,
            }),
        ).toEqual({ listed: true, disabled: false, inPlace: true });
        expect(
            warehouseMenuItem({
                hasWarehouse: true,
                canAddWithoutWarehouse: true,
                warehouses: { ...warehouses, canAdd: false },
            }),
        ).toEqual({ listed: true, disabled: true, inPlace: true });
    });

    it('hides it from people who do not manage the project', () => {
        expect(
            warehouseMenuItem({
                hasWarehouse: true,
                canAddWithoutWarehouse: false,
                warehouses: { ...warehouses, canManage: false, canAdd: false },
            }).listed,
        ).toBe(false);
    });

    it('connects a first warehouse through settings as before', () => {
        expect(
            warehouseMenuItem({
                hasWarehouse: false,
                canAddWithoutWarehouse: true,
                warehouses,
            }),
        ).toEqual({ listed: true, disabled: false, inPlace: false });
    });
});
