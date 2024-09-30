import {
    EXPLORE_FILTERED_WITH_ACCESS_LEVEL_1_2,
    EXPLORE_FILTERED_WITH_ACCESS_LEVEL_1_2_3,
    EXPLORE_FILTERED_WITH_ACCESS_LEVEL_2,
    EXPLORE_WITH_DIMENSION_REQUIRED_ATTRIBUTES,
    EXPLORE_WITH_NO_REQUIRED_ATTRIBUTES,
    EXPLORE_WITH_TABLE_AND_DIMENSION_REQUIRED_ATTRIBUTES,
    EXPLORE_WITH_TABLE_REQUIRED_ATTRIBUTES,
} from './UserAttributeUtil.mocks';
import {
    doesExploreMatchRequiredAttributes,
    exploreHasFilteredAttribute,
    getFilteredExplore,
    hasUserAttribute,
    hasUserAttributes,
} from './UserAttributeUtils';

describe('doesExploreMatchUserAttributes', () => {
    test('should be true if there are no required attributes', () => {
        expect(
            doesExploreMatchRequiredAttributes(
                EXPLORE_WITH_NO_REQUIRED_ATTRIBUTES,
                {},
            ),
        ).toStrictEqual(true);
        expect(
            doesExploreMatchRequiredAttributes(
                EXPLORE_WITH_NO_REQUIRED_ATTRIBUTES,
                { test: ['1'] },
            ),
        ).toStrictEqual(true);
    });
    test('should be true if required attribute value match', () => {
        expect(
            doesExploreMatchRequiredAttributes(
                EXPLORE_WITH_TABLE_REQUIRED_ATTRIBUTES,
                { access_level: ['2'] },
            ),
        ).toStrictEqual(true);
    });
    test('should be false if required attributes dont match', () => {
        expect(
            doesExploreMatchRequiredAttributes(
                EXPLORE_WITH_TABLE_REQUIRED_ATTRIBUTES,
                {},
            ),
        ).toStrictEqual(false);
        expect(
            doesExploreMatchRequiredAttributes(
                EXPLORE_WITH_TABLE_REQUIRED_ATTRIBUTES,
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
        ).toStrictEqual(EXPLORE_WITH_NO_REQUIRED_ATTRIBUTES);
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
