import {
    hasConnectionListingFields,
    supportsDatabaseListing,
    WAREHOUSE_TYPES_WITH_DATABASE_LISTING,
    WarehouseTypes,
} from './projects';

describe('hasConnectionListingFields', () => {
    test('is false when neither field is set', () => {
        expect(hasConnectionListingFields({})).toBe(false);
        expect(
            hasConnectionListingFields({
                listAllDatabases: false,
                additionalDatabases: [],
            }),
        ).toBe(false);
    });

    test('is true when the connection lists all databases', () => {
        expect(hasConnectionListingFields({ listAllDatabases: true })).toBe(
            true,
        );
    });

    test('is true when the connection names additional databases', () => {
        expect(
            hasConnectionListingFields({ additionalDatabases: ['finance'] }),
        ).toBe(true);
    });
});

describe('supportsDatabaseListing', () => {
    test('is false for an undefined warehouse type', () => {
        expect(supportsDatabaseListing(undefined)).toBe(false);
    });

    test('follows the supported list', () => {
        Object.values(WarehouseTypes).forEach((warehouseType) => {
            expect(supportsDatabaseListing(warehouseType)).toBe(
                WAREHOUSE_TYPES_WITH_DATABASE_LISTING.includes(warehouseType),
            );
        });
    });
});
