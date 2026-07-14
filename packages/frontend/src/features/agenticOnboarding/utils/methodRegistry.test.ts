import { WarehouseTypes } from '@lightdash/common';
import {
    ConnectMethodId,
    getMethodsForWarehouse,
    isValidMethodForWarehouse,
} from './methodRegistry';

describe('methodRegistry', () => {
    it('orders Snowflake methods with SSO first and recommended', () => {
        const methods = getMethodsForWarehouse(WarehouseTypes.SNOWFLAKE);
        expect(methods.map((m) => m.id)).toEqual([
            ConnectMethodId.CLI_SSO,
            ConnectMethodId.KEYPAIR,
            ConnectMethodId.PASSWORD,
            ConnectMethodId.PASTE,
            ConnectMethodId.MANUAL,
        ]);
        expect(methods.filter((m) => m.recommended).map((m) => m.id)).toEqual([
            ConnectMethodId.CLI_SSO,
        ]);
    });

    it('falls back to manual-only for other warehouses', () => {
        const methods = getMethodsForWarehouse(WarehouseTypes.POSTGRES);
        expect(methods.map((m) => m.id)).toEqual([ConnectMethodId.MANUAL]);
        expect(methods[0].recommended).toBe(true);
    });

    it('validates method ids against the warehouse registry', () => {
        expect(
            isValidMethodForWarehouse(
                WarehouseTypes.SNOWFLAKE,
                ConnectMethodId.CLI_SSO,
            ),
        ).toBe(true);
        expect(
            isValidMethodForWarehouse(
                WarehouseTypes.POSTGRES,
                ConnectMethodId.CLI_SSO,
            ),
        ).toBe(false);
        expect(
            isValidMethodForWarehouse(WarehouseTypes.SNOWFLAKE, 'nonsense'),
        ).toBe(false);
    });
});
