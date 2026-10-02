import { describe, expect, it } from 'vitest';
import {
    getPersonalSignInExpiredMessage,
    getPersonalSignInExpiredWarehouse,
    isPersonalSignInExpiredMessage,
} from './personalSignIn';
import { WarehouseTypes } from './projects';

describe('personal sign-in expiry messages', () => {
    it.each([
        WarehouseTypes.BIGQUERY,
        WarehouseTypes.SNOWFLAKE,
        WarehouseTypes.DATABRICKS,
        WarehouseTypes.REDSHIFT,
    ] as const)(
        'round trips %s through a stored query message',
        (warehouseType) => {
            const message = `${getPersonalSignInExpiredMessage(warehouseType)}\n\nProvider detail`;
            expect(isPersonalSignInExpiredMessage(message)).toBe(true);
            expect(getPersonalSignInExpiredWarehouse(message)).toBe(
                warehouseType,
            );
        },
    );

    it('does not match other errors', () => {
        expect(
            getPersonalSignInExpiredWarehouse('Permission denied'),
        ).toBeNull();
        expect(isPersonalSignInExpiredMessage('Your sign-in has expired')).toBe(
            false,
        );
    });
});
