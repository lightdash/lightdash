import { WarehouseTypes } from '@lightdash/common';
import { assertConnectionDatabaseListing } from './extraConnectionSettings';

describe('assertConnectionDatabaseListing', () => {
    it.each(Object.values(WarehouseTypes))(
        'allows default listing settings for %s',
        (warehouseType) => {
            expect(() =>
                assertConnectionDatabaseListing(warehouseType, {}),
            ).not.toThrow();
            expect(() =>
                assertConnectionDatabaseListing(warehouseType, {
                    listAllDatabases: false,
                    additionalDatabases: [],
                }),
            ).not.toThrow();
        },
    );
    it.each([{ listAllDatabases: true }, { additionalDatabases: ['archive'] }])(
        'rejects unsupported listing requests %j',
        (settings) => {
            expect(() =>
                assertConnectionDatabaseListing(
                    WarehouseTypes.SNOWFLAKE,
                    settings,
                ),
            ).toThrow('Database listing settings are not supported');
        },
    );
});
