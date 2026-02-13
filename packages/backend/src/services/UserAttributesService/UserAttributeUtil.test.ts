import {
    EXPLORE_FILTERED_WITH_ACCESS_LEVEL_1_2,
    EXPLORE_FILTERED_WITH_ACCESS_LEVEL_1_2_3,
    EXPLORE_FILTERED_WITH_ACCESS_LEVEL_2,
    EXPLORE_FILTERED_WITH_ROLE_ANALYST,
    EXPLORE_FILTERED_WITH_SALES_ANALYST_HR,
    EXPLORE_FILTERED_WITH_SALES_AND_ANALYST,
    EXPLORE_WITH_DIMENSION_ANY_ATTRIBUTES,
    EXPLORE_WITH_DIMENSION_REQUIRED_ATTRIBUTES,
    EXPLORE_WITH_NO_REQUIRED_ATTRIBUTES,
    EXPLORE_WITH_TABLE_AND_DIMENSION_ANY_ATTRIBUTES,
    EXPLORE_WITH_TABLE_AND_DIMENSION_REQUIRED_ATTRIBUTES,
    EXPLORE_WITH_TABLE_ANY_ATTRIBUTES,
    EXPLORE_WITH_TABLE_REQUIRED_AND_ANY_ATTRIBUTES,
    EXPLORE_WITH_TABLE_REQUIRED_ATTRIBUTES,
} from './UserAttributeUtil.mocks';
import {
    checkUserAttributesAccess,
    doesExploreMatchRequiredAttributes,
    exploreHasFilteredAttribute,
    getFilteredExplore,
    hasAnyUserAttributes,
    hasUserAttribute,
    hasUserAttributes,
} from './UserAttributeUtils';

describe('doesExploreMatchUserAttributes', () => {
    test('should be true if there are no required attributes', () => {
        expect(
            doesExploreMatchRequiredAttributes(
                EXPLORE_WITH_NO_REQUIRED_ATTRIBUTES.tables[
                    EXPLORE_WITH_NO_REQUIRED_ATTRIBUTES.baseTable
                ].requiredAttributes,
                undefined,
                {},
            ),
        ).toStrictEqual(true);
        expect(
            doesExploreMatchRequiredAttributes(
                EXPLORE_WITH_NO_REQUIRED_ATTRIBUTES.tables[
                    EXPLORE_WITH_NO_REQUIRED_ATTRIBUTES.baseTable
                ].requiredAttributes,
                undefined,
                { test: ['1'] },
            ),
        ).toStrictEqual(true);
    });
    test('should be true if required attribute value match', () => {
        expect(
            doesExploreMatchRequiredAttributes(
                EXPLORE_WITH_TABLE_REQUIRED_ATTRIBUTES.tables[
                    EXPLORE_WITH_TABLE_REQUIRED_ATTRIBUTES.baseTable
                ].requiredAttributes,
                undefined,
                { access_level: ['2'] },
            ),
        ).toStrictEqual(true);
    });
    test('should be false if required attributes dont match', () => {
        expect(
            doesExploreMatchRequiredAttributes(
                EXPLORE_WITH_TABLE_REQUIRED_ATTRIBUTES.tables[
                    EXPLORE_WITH_TABLE_REQUIRED_ATTRIBUTES.baseTable
                ].requiredAttributes,
                undefined,
                {},
            ),
        ).toStrictEqual(false);
        expect(
            doesExploreMatchRequiredAttributes(
                EXPLORE_WITH_TABLE_REQUIRED_ATTRIBUTES.tables[
                    EXPLORE_WITH_TABLE_REQUIRED_ATTRIBUTES.baseTable
                ].requiredAttributes,
                undefined,
                { access_level: ['1'] },
            ),
        ).toStrictEqual(false);
    });
});
describe('exploreHasFilteredAttribute', () => {
    test('should detect when explore requires attributes', () => {
        expect(
            exploreHasFilteredAttribute(EXPLORE_WITH_NO_REQUIRED_ATTRIBUTES),
        ).toStrictEqual(false);
        expect(
            exploreHasFilteredAttribute(EXPLORE_WITH_TABLE_REQUIRED_ATTRIBUTES),
        ).toStrictEqual(true);
        expect(
            exploreHasFilteredAttribute(
                EXPLORE_WITH_DIMENSION_REQUIRED_ATTRIBUTES,
            ),
        ).toStrictEqual(true);
        expect(
            exploreHasFilteredAttribute(
                EXPLORE_WITH_TABLE_AND_DIMENSION_REQUIRED_ATTRIBUTES,
            ),
        ).toStrictEqual(true);
    });
});
describe('getFilteredExplore', () => {
    test('should return same explore if it doesnt need filtering', () => {
        expect(
            getFilteredExplore(EXPLORE_WITH_NO_REQUIRED_ATTRIBUTES, {}),
        ).toStrictEqual({
            ...EXPLORE_WITH_NO_REQUIRED_ATTRIBUTES,
            unfilteredTables: EXPLORE_WITH_NO_REQUIRED_ATTRIBUTES.tables,
        });
    });
    test('should throw error if it doesnt have permission for main table', () => {
        expect(() =>
            getFilteredExplore(
                EXPLORE_WITH_TABLE_AND_DIMENSION_REQUIRED_ATTRIBUTES,
                { access_level: ['1'] },
            ),
        ).toThrow("You don't have authorization to access this explore");
    });
    test('should return filtered explore based on user attributes', () => {
        expect(
            getFilteredExplore(
                EXPLORE_WITH_TABLE_AND_DIMENSION_REQUIRED_ATTRIBUTES,
                { access_level: ['2'] },
            ),
        ).toStrictEqual(EXPLORE_FILTERED_WITH_ACCESS_LEVEL_2);
        expect(
            getFilteredExplore(
                EXPLORE_WITH_TABLE_AND_DIMENSION_REQUIRED_ATTRIBUTES,
                { access_level: ['1', '2'] },
            ),
        ).toStrictEqual(EXPLORE_FILTERED_WITH_ACCESS_LEVEL_1_2);
        expect(
            getFilteredExplore(
                EXPLORE_WITH_TABLE_AND_DIMENSION_REQUIRED_ATTRIBUTES,
                { access_level: ['1', '2', '3'] },
            ),
        ).toStrictEqual(EXPLORE_FILTERED_WITH_ACCESS_LEVEL_1_2_3);
    });
});
describe('hasUserAttribute', () => {
    test('should be false if attribute is not present', () => {
        expect(hasUserAttribute({ test: ['1'] }, 'another', '1')).toStrictEqual(
            false,
        );
    });
    test('should be false if attribute value does not match', () => {
        expect(hasUserAttribute({ test: ['1'] }, 'test', '2')).toStrictEqual(
            false,
        );
    });
    test('should be true if attribute value match user', () => {
        expect(hasUserAttribute({ test: ['1'] }, 'test', '1')).toStrictEqual(
            true,
        );
    });

    test('should be false if attribute value match a different user', () => {
        expect(hasUserAttribute({ test: [] }, 'test', '1')).toStrictEqual(
            false,
        );
    });
});
describe('hasUserAttributes', () => {
    test('should be true if there are no required attributes', () => {
        expect(hasUserAttributes(undefined, { test: ['1'] })).toStrictEqual(
            true,
        );
        expect(hasUserAttributes({}, { test: ['1'] })).toStrictEqual(true);
    });
    test('should be false if required attributes are not present', () => {
        expect(
            hasUserAttributes({ another: '1' }, { test: ['1'] }),
        ).toStrictEqual(false);
    });
    test('should be false if required attribute values does not match', () => {
        expect(hasUserAttributes({ test: '2' }, { test: ['1'] })).toStrictEqual(
            false,
        );
        expect(hasUserAttributes({ test: '1' }, { test: [] })).toStrictEqual(
            false,
        );
        expect(
            hasUserAttributes(
                { test: '2', another: '1' },
                { test: ['1'], another: ['1'] },
            ),
        ).toStrictEqual(false);
    });
    test('should be true if required attribute value match', () => {
        expect(hasUserAttributes({ test: '1' }, { test: ['1'] })).toStrictEqual(
            true,
        );
    });
});

describe('hasAnyUserAttributes', () => {
    test('should be true if anyAttributes object is empty', () => {
        expect(hasAnyUserAttributes({}, { test: ['1'] })).toStrictEqual(true);
        expect(hasAnyUserAttributes({}, {})).toStrictEqual(true);
    });
    test('should be true if user has ANY matching attribute (OR logic)', () => {
        // User has 'sales' which matches one of the allowed values
        expect(
            hasAnyUserAttributes(
                { department: ['sales', 'finance'] },
                { department: ['sales'] },
            ),
        ).toStrictEqual(true);
        // User has 'finance' which matches one of the allowed values
        expect(
            hasAnyUserAttributes(
                { department: ['sales', 'finance'] },
                { department: ['finance'] },
            ),
        ).toStrictEqual(true);
        // User has both, still passes
        expect(
            hasAnyUserAttributes(
                { department: ['sales', 'finance'] },
                { department: ['sales', 'finance'] },
            ),
        ).toStrictEqual(true);
    });
    test('should be true if user matches ANY of multiple attribute conditions', () => {
        // User has department=sales but not role=admin - should pass OR logic
        expect(
            hasAnyUserAttributes(
                { department: 'sales', role: 'admin' },
                { department: ['sales'] },
            ),
        ).toStrictEqual(true);
        // User has role=admin but not department=sales - should pass OR logic
        expect(
            hasAnyUserAttributes(
                { department: 'sales', role: 'admin' },
                { role: ['admin'] },
            ),
        ).toStrictEqual(true);
    });
    test('should be false if user has NONE of the required attributes', () => {
        expect(
            hasAnyUserAttributes(
                { department: ['sales', 'finance'] },
                { department: ['hr'] },
            ),
        ).toStrictEqual(false);
        expect(
            hasAnyUserAttributes({ department: 'sales' }, { role: ['admin'] }),
        ).toStrictEqual(false);
        expect(
            hasAnyUserAttributes(
                { department: 'sales', role: 'admin' },
                { department: ['hr'], role: ['analyst'] },
            ),
        ).toStrictEqual(false);
    });
    test('should work with single string value in anyAttributes', () => {
        expect(
            hasAnyUserAttributes({ role: 'admin' }, { role: ['admin'] }),
        ).toStrictEqual(true);
        expect(
            hasAnyUserAttributes({ role: 'admin' }, { role: ['analyst'] }),
        ).toStrictEqual(false);
    });
});

describe('checkUserAttributesAccess', () => {
    test('should return true when both required and any are undefined', () => {
        expect(
            checkUserAttributesAccess(undefined, undefined, {}),
        ).toStrictEqual(true);
        expect(
            checkUserAttributesAccess(undefined, undefined, { test: ['1'] }),
        ).toStrictEqual(true);
    });
    test('should return true when only required is defined and matches', () => {
        expect(
            checkUserAttributesAccess({ test: '1' }, undefined, {
                test: ['1'],
            }),
        ).toStrictEqual(true);
    });
    test('should return false when only required is defined and does not match', () => {
        expect(
            checkUserAttributesAccess({ test: '2' }, undefined, {
                test: ['1'],
            }),
        ).toStrictEqual(false);
    });
    test('should return true when only any is defined and matches', () => {
        expect(
            checkUserAttributesAccess(
                undefined,
                { role: 'admin' },
                {
                    role: ['admin'],
                },
            ),
        ).toStrictEqual(true);
        expect(
            checkUserAttributesAccess(
                undefined,
                { role: ['admin', 'analyst'] },
                {
                    role: ['analyst'],
                },
            ),
        ).toStrictEqual(true);
    });
    test('should return false when only any is defined and does not match', () => {
        expect(
            checkUserAttributesAccess(
                undefined,
                { role: 'admin' },
                {
                    role: ['analyst'],
                },
            ),
        ).toStrictEqual(false);
    });
    test('should return true when both are defined and both match', () => {
        expect(
            checkUserAttributesAccess(
                { access_level: '2' },
                { department: ['sales', 'finance'] },
                { access_level: ['2'], department: ['sales'] },
            ),
        ).toStrictEqual(true);
    });
    test('should return false when required matches but any does not', () => {
        expect(
            checkUserAttributesAccess(
                { access_level: '2' },
                { department: ['sales', 'finance'] },
                { access_level: ['2'], department: ['hr'] },
            ),
        ).toStrictEqual(false);
    });
    test('should return false when any matches but required does not', () => {
        expect(
            checkUserAttributesAccess(
                { access_level: '3' },
                { department: ['sales', 'finance'] },
                { access_level: ['2'], department: ['sales'] },
            ),
        ).toStrictEqual(false);
    });
});

describe('doesExploreMatchRequiredAttributes with anyAttributes', () => {
    test('should return true when anyAttributes match', () => {
        expect(
            doesExploreMatchRequiredAttributes(
                undefined,
                EXPLORE_WITH_TABLE_ANY_ATTRIBUTES.tables[
                    EXPLORE_WITH_TABLE_ANY_ATTRIBUTES.baseTable
                ].anyAttributes,
                { role: ['analyst'] },
            ),
        ).toStrictEqual(true);
    });
    test('should return false when anyAttributes do not match', () => {
        expect(
            doesExploreMatchRequiredAttributes(
                undefined,
                EXPLORE_WITH_TABLE_ANY_ATTRIBUTES.tables[
                    EXPLORE_WITH_TABLE_ANY_ATTRIBUTES.baseTable
                ].anyAttributes,
                { role: ['admin'] },
            ),
        ).toStrictEqual(false);
    });
    test('should return true when both required and any attributes match', () => {
        expect(
            doesExploreMatchRequiredAttributes(
                EXPLORE_WITH_TABLE_REQUIRED_AND_ANY_ATTRIBUTES.tables[
                    EXPLORE_WITH_TABLE_REQUIRED_AND_ANY_ATTRIBUTES.baseTable
                ].requiredAttributes,
                EXPLORE_WITH_TABLE_REQUIRED_AND_ANY_ATTRIBUTES.tables[
                    EXPLORE_WITH_TABLE_REQUIRED_AND_ANY_ATTRIBUTES.baseTable
                ].anyAttributes,
                { access_level: ['2'], role: ['analyst'] },
            ),
        ).toStrictEqual(true);
    });
    test('should return false when required matches but any does not', () => {
        expect(
            doesExploreMatchRequiredAttributes(
                EXPLORE_WITH_TABLE_REQUIRED_AND_ANY_ATTRIBUTES.tables[
                    EXPLORE_WITH_TABLE_REQUIRED_AND_ANY_ATTRIBUTES.baseTable
                ].requiredAttributes,
                EXPLORE_WITH_TABLE_REQUIRED_AND_ANY_ATTRIBUTES.tables[
                    EXPLORE_WITH_TABLE_REQUIRED_AND_ANY_ATTRIBUTES.baseTable
                ].anyAttributes,
                { access_level: ['2'], role: ['viewer'] },
            ),
        ).toStrictEqual(false);
    });
});

describe('exploreHasFilteredAttribute with anyAttributes', () => {
    test('should detect when table has anyAttributes', () => {
        expect(
            exploreHasFilteredAttribute(EXPLORE_WITH_TABLE_ANY_ATTRIBUTES),
        ).toStrictEqual(true);
    });
    test('should detect when dimension has anyAttributes', () => {
        expect(
            exploreHasFilteredAttribute(EXPLORE_WITH_DIMENSION_ANY_ATTRIBUTES),
        ).toStrictEqual(true);
    });
    test('should detect when table has both required and any attributes', () => {
        expect(
            exploreHasFilteredAttribute(
                EXPLORE_WITH_TABLE_REQUIRED_AND_ANY_ATTRIBUTES,
            ),
        ).toStrictEqual(true);
    });
});

describe('getFilteredExplore with anyAttributes', () => {
    test('should throw error if user does not have permission for base table anyAttributes', () => {
        // Base table is payments which requires role=analyst
        // User only has department=hr, so they can't access the base table
        expect(() =>
            getFilteredExplore(
                EXPLORE_WITH_TABLE_AND_DIMENSION_ANY_ATTRIBUTES,
                {
                    department: ['hr'],
                },
            ),
        ).toThrow("You don't have authorization to access this explore");
    });
    test('should throw when user has wrong attribute for base table', () => {
        // Base table is payments which requires role=analyst
        // User only has department=sales (matches orders but not payments)
        expect(() =>
            getFilteredExplore(
                EXPLORE_WITH_TABLE_AND_DIMENSION_ANY_ATTRIBUTES,
                {
                    department: ['sales'],
                },
            ),
        ).toThrow("You don't have authorization to access this explore");
    });
    test('should filter tables when user matches payments but not orders', () => {
        // User has role=analyst, matches payments (base table) but not orders (needs department in sales/finance)
        // dim_amount_diff references orders, so it's also filtered out
        expect(
            getFilteredExplore(
                EXPLORE_WITH_TABLE_AND_DIMENSION_ANY_ATTRIBUTES,
                {
                    role: ['analyst'],
                },
            ),
        ).toStrictEqual(EXPLORE_FILTERED_WITH_ROLE_ANALYST);
    });
    test('should include both tables when user has both attributes', () => {
        // User has department=sales and role=analyst
        expect(
            getFilteredExplore(
                EXPLORE_WITH_TABLE_AND_DIMENSION_ANY_ATTRIBUTES,
                {
                    department: ['sales'],
                    role: ['analyst'],
                },
            ),
        ).toStrictEqual(EXPLORE_FILTERED_WITH_SALES_AND_ANALYST);
    });
    test('should filter dimensions based on anyAttributes', () => {
        // User has department=sales, role=analyst, and department=hr (matches dimension)
        expect(
            getFilteredExplore(
                EXPLORE_WITH_TABLE_AND_DIMENSION_ANY_ATTRIBUTES,
                {
                    department: ['sales', 'hr'],
                    role: ['analyst'],
                },
            ),
        ).toStrictEqual(EXPLORE_FILTERED_WITH_SALES_ANALYST_HR);
    });
    test('should work with combined requiredAttributes and anyAttributes', () => {
        // User needs access_level=2 (required) AND role=analyst or admin (any)
        expect(
            getFilteredExplore(EXPLORE_WITH_TABLE_REQUIRED_AND_ANY_ATTRIBUTES, {
                access_level: ['1', '2'],
                department: ['sales'],
                role: ['analyst'],
            }),
        ).toStrictEqual({
            ...EXPLORE_WITH_TABLE_REQUIRED_AND_ANY_ATTRIBUTES,
            unfilteredTables: {
                ...EXPLORE_WITH_TABLE_REQUIRED_AND_ANY_ATTRIBUTES.tables,
            },
        });
    });
    test('should throw when required matches but any does not for base table', () => {
        expect(() =>
            getFilteredExplore(EXPLORE_WITH_TABLE_REQUIRED_AND_ANY_ATTRIBUTES, {
                access_level: ['2'],
                department: ['hr'], // Does not match payments anyAttributes (needs analyst/admin role)
            }),
        ).toThrow("You don't have authorization to access this explore");
    });
});
